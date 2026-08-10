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
  /** The sub-works awarded under this schedule, each with its own rates. */
  subWorks: Array<{ name: string; escalation: string; bidRate: string }>;
  /** Item numbers accepted under this schedule, as printed in the LOA. */
  items: string[];
}

export interface ExtractedAgreement {
  /** What kind of railway document this is — used to tell an agreement from a bill. */
  documentType: 'agreement' | 'bill' | 'other';
  schedules: ExtractedSchedule[];
  /** The single overall tender percentage: above = +, below = -, at par = 0. */
  acceptedPercentage: number | null;
  /** A separately stated rebate %, positive. Not the same as a below-estimate offer. */
  rebatePercentage: number | null;
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

const MONTH_NAMES = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/**
 * The tender closing date as printed in the document, or null.
 *
 * Every LOA states it in its opening line — "Tender No. TPJ-17-2025-01 closing date
 * 17-11-2025 15:00" — and agreements carry a "Closing Date/Time" field. Reading it
 * from the text is exact, where the AI can transpose or miss it, and this one date
 * sets the base month for the whole contract.
 */
export async function findPrintedClosingDate(pdfBuffer: Buffer): Promise<string | null> {
  let text: string;
  try {
    const { extractLayoutText } = await import('../pdf-layout-extract');
    text = (await extractLayoutText(pdfBuffer)).replace(/\s+/g, ' ');
  } catch (err) {
    console.warn('agreement-extractor: could not read the PDF text for the closing date:', err);
    return null;
  }

  const label = String.raw`clos(?:ing|ed)\s*(?:date|on)(?:\s*\/?\s*time)?\s*[:\-–]?\s*`;
  const found = new Set<string>();

  // "closing date 17-11-2025", "Closing Date/Time : 17.11.2025 15:00"
  for (const m of text.matchAll(new RegExp(label + String.raw`(\d{1,2})\s*[-\/.]\s*(\d{1,2})\s*[-\/.]\s*(\d{4})`, 'gi'))) {
    const iso = isoDate(Number(m[1]), Number(m[2]), Number(m[3]));
    if (iso) found.add(iso);
  }
  // "closing date 17 Nov 2025" / "05-June-2025"
  for (const m of text.matchAll(new RegExp(label + String.raw`(\d{1,2})\s*[-\/. ]\s*([A-Za-z]{3,9})\s*[-\/. ,]+\s*(\d{4})`, 'gi'))) {
    const month = MONTH_NAMES.indexOf(m[2].slice(0, 3).toLowerCase()) + 1;
    const iso = month > 0 ? isoDate(Number(m[1]), month, Number(m[3])) : null;
    if (iso) found.add(iso);
  }

  // Only override the AI when the document is unambiguous. A tender whose closing date
  // was extended by corrigendum prints both, and picking one by position would be a
  // coin toss — the model reads the surrounding words, so let it decide those.
  if (found.size !== 1) {
    if (found.size > 1) console.warn(`agreement-extractor: ${found.size} different closing dates printed (${[...found].join(', ')}); leaving it to the AI`);
    return null;
  }
  return [...found][0];
}

/**
 * Day-first, as Indian tender documents are written: 05-06-2025 is 5 June 2025.
 * Returns null rather than guessing when the numbers can't be a real date.
 */
function isoDate(day: number, month: number, year: number): string | null {
  if (!(day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 1990 && year <= 2100)) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
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

Return ONLY raw JSON (no markdown, no code fences) with these keys. Use null when a value is not clearly present. Convert every date to "YYYY-MM-DD" — these documents write dates DAY FIRST, so 05-06-2025 means 5 June 2025 -> "2025-06-05", never 6 May. Convert money to a plain number (no commas, no ₹).

{
  "documentType": "Classify this document: 'agreement' if it is a tender/contract agreement, e-tender document or Letter of Acceptance (LOA); 'bill' if it is a running account bill / RA bill / measurement or deviation statement (it lists executed quantities and amounts since last bill); 'other' if neither. Note: a running bill often prints the agreement number too, so do NOT call it 'agreement' just because an agreement number appears.",
  "agreementNo": "Contract Agreement No (e.g. SR/TPJ/Civil/2026/0068)",
  "loaNo": "LOA Number",
  "loaDate": "LOA Date (YYYY-MM-DD)",
  "contractorName": "Contractor's name",
  "contractorPhone": "Contractor phone/mobile if present, else null",
  "workDescription": "Full name/description of the work",
  "closingDate": "Tender Closing Date, YYYY-MM-DD. On an agreement this is the 'Closing Date/Time' field. On a Letter of Acceptance it is written into the opening sentence, e.g. 'Tender No. TPJ-17-2025-01 closing date 17-11-2025 15:00' -> 2025-11-17. Ignore the time. This is NOT the LOA date and NOT the agreement date.",
  "completionDate": "Date of Completion, YYYY-MM-DD",
  "completionPeriodMonths": "Period of Completion in whole months (number)",
  "tenderAdvertisedValue": "Advertised Value / Tender Amount (number)",
  "agreementAmount": "LOA Amount / accepted contract value (number)",
  "railwayName": "Railway zone name (e.g. Southern Railway)",
  "division": "Division/Unit (e.g. Tiruchchirappalli / TPJ)",
  "schedules": "Every work schedule listed (Schedule A1, A2, B1, ...). Each element: { name, escalation, bidRate, subWorks, items }. name = the schedule's title. escalation and bidRate = percentages stated for the schedule AS A WHOLE, else null. subWorks = the rows under that schedule in the 'Awarded Quantities And Rates' table — each row is a sub-work priced separately, as { name, escalation, bidRate }: name is the item description (e.g. 'Renewal of roofing sheet in foundry shop.'), escalation is that row's Escl. (%) as a signed number with 'At Par' meaning 0, bidRate is that row's Bid Rate as a signed number ('17.00 % Above' is 17, '5.00 % Below' is -5, 'At Par' is 0). items = every item number printed under the schedule, exactly as printed (e.g. '1', '5.35', '082011'), or [] where none are listed. Return [] if no schedules are listed.",
  "acceptedPercentage": "The ONE overall tender percentage the offer was accepted at, as a number: ABOVE the estimate is POSITIVE, BELOW is NEGATIVE, 'at par' is 0. A Letter of Acceptance states this in a sentence rather than a table — 'your offer ... at 5.75% below the estimated cost is accepted' -> -5.75; 'quoted 3% excess' -> 3; '(-)7.5%' -> -7.5; 'at par' -> 0. Words to read as BELOW: below, less, discount, rebate, minus, (-). Words to read as ABOVE: above, excess, over, plus, (+). Return null if no such percentage is stated anywhere.",
  "rebatePercentage": "Any separately stated REBATE % (a discount on the accepted rates, sometimes offered in a later letter), as a positive number. Null if the document states no separate rebate. Do NOT repeat acceptedPercentage here — a below-estimate offer is not a rebate."
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
      body: JSON.stringify({ model: 'route-llm', messages, response_format: { type: 'json_object' }, max_tokens: 9000, temperature: 0.1 }),
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
  const finishReason = data?.choices?.[0]?.finish_reason;
  let extracted: any = {};
  try {
    extracted = JSON.parse(content);
  } catch {
    const truncated = finishReason === 'length';
    console.error(
      `agreement-extractor: unparseable AI reply (finish_reason=${finishReason ?? 'unknown'}, ${String(content ?? '').length} chars):`,
      String(content ?? '').slice(-300),
    );
    await recordAiUsage({ operation: 'agreement-extraction', success: false, errorType: truncated ? 'truncated' : 'parse_error' });
    return {
      ok: false,
      status: 502,
      error: truncated
        ? 'The document has more schedules and items than one reading could return. Please try again; if it repeats, fill the form manually.'
        : 'Could not read the agreement clearly. Please fill the form manually.',
    };
  }

  const usage = data?.usage || {};
  await recordAiUsage({
    operation: 'agreement-extraction',
    promptTokens: usage.prompt_tokens,
    completionTokens: usage.completion_tokens,
    totalTokens: usage.total_tokens,
    success: true,
  });

  // The closing date decides the base month, and a base month that is out by a month
  // skews every quarter's PVC without ever looking wrong. Both agreements and LOAs
  // print it in plain words, so read it off the page and let that beat the model —
  // the AI is only the fallback here.
  const printedClosingDate = await findPrintedClosingDate(Buffer.from(pdfBytes));
  if (printedClosingDate && printedClosingDate !== extracted.closingDate) {
    console.log(`agreement-extractor: closing date from the document text (${printedClosingDate}) overrides the AI's (${extracted.closingDate ?? 'none'})`);
    extracted.closingDate = printedClosingDate;
  }

  // Base-month rule: baseMonth = month BEFORE the closing date, and the server
  // derives it from dateOfOpening. So map the closing date onto dateOfOpening.
  const dateOfOpening = extracted.closingDate || extracted.dateOfOpening || null;

  // Normalise the extracted schedules to { name, escalation, bidRate } strings and
  // drop any without a name, so the form can drop them straight into its schedule rows.
  const asStr = (v: any) => (v === null || v === undefined ? '' : String(v).trim());
  /**
   * A percentage as printed on a letter, to a signed number.
   *
   * "at par" is a real answer meaning zero, and must not become null — null says
   * "nothing stated", which sends the reader hunting through the LOA for a figure that
   * is not there. "(-)5.75" and "5.75% below" are the same number.
   */
  const parsePercent = (raw: unknown): number | null => {
    if (raw === null || raw === undefined) return null;
    if (typeof raw === 'number') return isFinite(raw) ? raw : null;
    const text = String(raw).trim().toLowerCase();
    if (!text) return null;
    if (/ats*par/.test(text)) return 0;
    const digits = text.match(/-?d+(?:.d+)?/);
    if (!digits) return null;
    let value = parseFloat(digits[0]);
    if (!isFinite(value)) return null;
    const saysBelow = /below|less|discount|rebate|minus|(s*-s*)|(^|[^d])-/.test(text);
    if (saysBelow) value = -Math.abs(value);
    return value;
  };

  const schedules: ExtractedSchedule[] = Array.isArray(extracted.schedules)
    ? extracted.schedules
        .map((s: any) => ({
          name: asStr(s?.name),
          escalation: asStr(s?.escalation).replace(/%/g, ''),
          bidRate: asStr(s?.bidRate).replace(/%/g, ''),
          // The item numbers accepted under this schedule, kept exactly as printed —
          // a bill cites them the same way, and normalising here would only make the
          // two sides disagree about what counts as the same item.
          items: Array.isArray(s?.items)
            ? Array.from(new Set(s.items.map((value: unknown) => asStr(value)).filter(Boolean)))
            : [],
          // Each sub-work keeps its own rates. "At Par" reads as 0 and "% Below" as
          // negative, the same way the whole-LOA percentage is read above.
          subWorks: Array.isArray(s?.subWorks)
            ? s.subWorks
                .map((w: any) => ({
                  name: asStr(w?.name),
                  escalation: asStr(parsePercent(w?.escalation) ?? asStr(w?.escalation).replace(/%/g, '')),
                  bidRate: asStr(parsePercent(w?.bidRate) ?? asStr(w?.bidRate).replace(/%/g, '')),
                }))
                .filter((w: any) => w.name)
            : [],
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
      // Percentages arrive as "5.75", "(-)5.75", "-5.75 %" or "at par" depending on the
      // letter; keep the sign, drop everything else.
      acceptedPercentage: parsePercent(extracted.acceptedPercentage),
      rebatePercentage: parsePercent(extracted.rebatePercentage),
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
