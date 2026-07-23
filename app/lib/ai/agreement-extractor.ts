/**
 * Shared agreement-PDF extractor.
 *
 * The core "read an Indian Railway agreement PDF and pull the contract fields"
 * logic lives here so BOTH the web route (app/api/contracts/extract-agreement)
 * and the Telegram bot can call it directly — no HTTP round-trip, no session.
 *
 * The web route keeps its own auth + rate-limit wrapper; this function only does
 * the AI extraction and normalisation.
 */

import { PDFDocument } from 'pdf-lib';
import { recordAiUsage } from '@/lib/ai-usage';

// Every field we need (agreement no, LOA, contractor, work description, closing
// date, values) is on the opening pages; a full 70+ page agreement overwhelms the
// AI request, so we only send the first PAGES_TO_SEND pages.
const PAGES_TO_SEND = 12;
const ABACUS_ENDPOINT = 'https://routellm.abacus.ai/v1/chat/completions';

export interface ExtractedSchedule {
  name: string;
  escalation: string;
  bidRate: string;
}

export interface ExtractedAgreement {
  /** What kind of railway document this is — used to tell an agreement from a bill. */
  documentType: 'agreement' | 'bill' | 'other';
  schedules: ExtractedSchedule[];
  agreementNo: string | null;
  loaNo: string | null;
  loaDate: string | null;
  contractorName: string | null;
  contractorPhone: string | null;
  workDescription: string | null;
  dateOfOpening: string | null;
  closingDate: string | null;
  completionDate: string | null;
  completionPeriodMonths: string | number | null;
  tenderAdvertisedValue: string | number | null;
  agreementAmount: string | number | null;
  railwayName: string | null;
  division: string | null;
}

export interface AgreementExtractionResult {
  ok: boolean;
  data?: ExtractedAgreement;
  status?: number;
  error?: string;
}

/**
 * Extract contract fields from an agreement PDF.
 * @param original raw PDF bytes
 * @param filename original file name (sent to the AI as context)
 */
export async function extractAgreementFromPdf(
  original: Buffer,
  filename: string,
): Promise<AgreementExtractionResult> {
  const apiKey = process.env.ABACUSAI_API_KEY;
  if (!apiKey) {
    return { ok: false, status: 503, error: 'AI service is not configured.' };
  }

  // Trim to the first few pages so the AI request stays small and reliable.
  let pdfBytes: Uint8Array = new Uint8Array(original);
  try {
    const src = await PDFDocument.load(original, { ignoreEncryption: true });
    const total = src.getPageCount();
    if (total > PAGES_TO_SEND) {
      const trimmed = await PDFDocument.create();
      const pages = await trimmed.copyPages(src, Array.from({ length: PAGES_TO_SEND }, (_, i) => i));
      pages.forEach((p) => trimmed.addPage(p));
      pdfBytes = await trimmed.save();
    }
  } catch (err) {
    console.warn('agreement-extractor: could not trim PDF, sending original:', err);
  }
  const dataUri = `data:application/pdf;base64,${Buffer.from(pdfBytes).toString('base64')}`;

  const prompt = `You are extracting fields from an Indian Railway "Contract Agreement of Works" / e-tender agreement PDF to pre-fill a form. Read the whole document.

Return ONLY raw JSON (no markdown, no code fences) with these keys. Use null when a value is not clearly present. Convert every date to "YYYY-MM-DD". Convert money to a plain number (no commas, no ₹).

{
  "documentType": "Classify this document: 'agreement' if it is a tender/contract agreement, e-tender document or Letter of Acceptance (LOA); 'bill' if it is a running account bill / RA bill / measurement or deviation statement (it lists executed quantities and amounts since last bill); 'other' if neither. Note: a running bill often prints the agreement number too, so do NOT call it 'agreement' just because an agreement number appears.",
  "agreementNo": "Contract Agreement No (e.g. SR/TPJ/Civil/2026/0068)",
  "loaNo": "LOA Number",
  "loaDate": "LOA Date (YYYY-MM-DD)",
  "contractorName": "Contractor's name",
  "contractorPhone": "Contractor phone/mobile if present, else null",
  "workDescription": "Full name/description of the work",
  "closingDate": "Tender Closing Date (the 'Closing Date/Time' field), YYYY-MM-DD",
  "completionDate": "Date of Completion, YYYY-MM-DD",
  "completionPeriodMonths": "Period of Completion in whole months (number)",
  "tenderAdvertisedValue": "Advertised Value / Tender Amount (number)",
  "agreementAmount": "LOA Amount / accepted contract value (number)",
  "railwayName": "Railway zone name (e.g. Southern Railway)",
  "division": "Division/Unit (e.g. Tiruchchirappalli / TPJ)",
  "schedules": "Array of the work schedules / schedule items listed in the agreement (e.g. Schedule-A, Schedule-B, or named item groups). For each, return {\"name\": \"schedule name/title\", \"escalation\": \"escalation % if a per-schedule escalation percentage is stated, else null\", \"bidRate\": \"tender/bid rate % above(+) or below(-) the estimate if stated for that schedule, else null\"}. Return [] if no schedules are listed."
}`;

  const messages = [
    {
      role: 'user',
      content: [
        { type: 'file', file: { filename, file_data: dataUri } },
        { type: 'text', text: prompt },
      ],
    },
  ];

  let response: Response;
  try {
    response = await fetch(ABACUS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: 'route-llm', messages, response_format: { type: 'json_object' }, max_tokens: 3500, temperature: 0.1 }),
      signal: AbortSignal.timeout(60000),
    });
  } catch {
    await recordAiUsage({ operation: 'agreement-extraction', success: false, errorType: 'network' });
    return { ok: false, status: 502, error: 'The AI request failed. Please try again.' };
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    console.error(`agreement-extractor: AI HTTP ${response.status}:`, text.slice(0, 500));
    const outOfCredit = response.status === 402 || /no remaining credits|insufficient credits|credit balance/i.test(text);
    await recordAiUsage({ operation: 'agreement-extraction', success: false, errorType: outOfCredit ? 'out_of_credit' : `http_${response.status}` });
    return {
      ok: false,
      status: outOfCredit ? 402 : 502,
      error: outOfCredit
        ? 'The AI service is out of credit. Please try again later.'
        : `Could not read the agreement (AI error ${response.status}). Please try again, or fill the form manually.`,
    };
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  let extracted: any = {};
  try {
    extracted = JSON.parse(content);
  } catch {
    await recordAiUsage({ operation: 'agreement-extraction', success: false, errorType: 'parse_error' });
    return { ok: false, status: 502, error: 'Could not read the agreement clearly. Please fill the form manually.' };
  }

  const usage = data?.usage || {};
  await recordAiUsage({
    operation: 'agreement-extraction',
    promptTokens: usage.prompt_tokens,
    completionTokens: usage.completion_tokens,
    totalTokens: usage.total_tokens,
    success: true,
  });

  // Base-month rule: baseMonth = month BEFORE the closing date, and the server
  // derives it from dateOfOpening. So map the closing date onto dateOfOpening.
  const dateOfOpening = extracted.closingDate || extracted.dateOfOpening || null;

  // Normalise the extracted schedules to { name, escalation, bidRate } strings and
  // drop any without a name, so the form can drop them straight into its schedule rows.
  const asStr = (v: any) => (v === null || v === undefined ? '' : String(v).trim());
  const schedules: ExtractedSchedule[] = Array.isArray(extracted.schedules)
    ? extracted.schedules
        .map((s: any) => ({
          name: asStr(s?.name),
          escalation: asStr(s?.escalation).replace(/%/g, ''),
          bidRate: asStr(s?.bidRate).replace(/%/g, ''),
        }))
        .filter((s: any) => s.name)
    : [];

  const docTypeRaw = String(extracted.documentType ?? '').trim().toLowerCase();
  const documentType: ExtractedAgreement['documentType'] =
    docTypeRaw === 'agreement' ? 'agreement' : docTypeRaw === 'bill' ? 'bill' : 'other';

  return {
    ok: true,
    data: {
      documentType,
      schedules,
      agreementNo: extracted.agreementNo ?? null,
      loaNo: extracted.loaNo ?? null,
      loaDate: extracted.loaDate ?? null,
      contractorName: extracted.contractorName ?? null,
      contractorPhone: extracted.contractorPhone ?? null,
      workDescription: extracted.workDescription ?? null,
      dateOfOpening,
      closingDate: extracted.closingDate ?? null,
      completionDate: extracted.completionDate ?? null,
      completionPeriodMonths: extracted.completionPeriodMonths ?? null,
      tenderAdvertisedValue: extracted.tenderAdvertisedValue ?? null,
      agreementAmount: extracted.agreementAmount ?? null,
      railwayName: extracted.railwayName ?? null,
      division: extracted.division ?? null,
    },
  };
}
