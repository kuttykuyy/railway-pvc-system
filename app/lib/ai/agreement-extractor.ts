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
import { recordAiUsage, tokensFromUsage } from '@/lib/ai-usage';
import { findClosingDateInText, parseAgreementText } from './agreement-direct-parser';
import { getAiModel } from './resolve-model';

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
  /** What actually went wrong, for the failure record — never shown to the user. */
  detail?: string;
  /** Things the reader could not get that the form can do without — shown to the user. */
  warnings?: string[];
  /** A scanned PDF the caller should read via the OCR service, then re-submit
   * with `ocrText`. Set only when `allowOcr` is passed and the OCR service is up. */
  needsOcr?: boolean;
}

/**
 * Extract contract fields from an agreement PDF.
 * @param original raw PDF bytes
 * @param filename original file name (sent to the AI as context)
 * @param opts.ocrText  clean text of a scanned PDF read by the Docling service;
 *   when present it is read instead of the (unreadable) page image.
 * @param opts.allowOcr the caller can drive the async OCR round-trip, so a scan
 *   with no text layer returns `{ needsOcr: true }` instead of a vision read.
 */
export async function extractAgreementFromPdf(
  original: Buffer,
  filename: string,
  opts: { ocrText?: string; allowOcr?: boolean } = {},
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

  // Read what we can straight from the PDF text FIRST. The AI is the primary reader
  // when it has credit (it handles unusual letters better), but this direct pass is
  // what lets a sign-up still get a pre-filled form when the AI is out of credit or
  // unreachable — matching how the bill reader already works.
  let pdfText = '';
  try {
    const { extractLayoutText } = await import('../pdf-layout-extract');
    pdfText = await extractLayoutText(Buffer.from(pdfBytes));
  } catch (err) {
    console.warn('agreement-extractor: could not read PDF text for the direct parse:', err);
  }
  // A scanned LOA has no text layer, so the direct pass reads nothing and the
  // vision model has only a blurry image. When the caller can OCR it, hand the
  // scan to the Docling service and read the clean text instead.
  const ocrText = (opts.ocrText || '').trim();
  if (ocrText) {
    pdfText = ocrText;
  } else if (opts.allowOcr && pdfText.replace(/\s/g, '').length < 60) {
    const { isDoclingConfigured } = await import('../ocr/docling');
    if (isDoclingConfigured()) {
      return { ok: false, needsOcr: true };
    }
  }
  const direct = pdfText ? parseAgreementText(pdfText) : null;

  // What the contract cannot be set up without: who, what, which number, and the closing
  // date that fixes the base month. Small enough that the reply is never cut off.
  const essentialsPrompt = `You are extracting fields from an Indian Railway "Contract Agreement of Works" / e-tender agreement PDF to pre-fill a form. Read the whole document.

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
  "acceptedPercentage": "The ONE overall tender percentage the offer was accepted at, as a number: ABOVE the estimate is POSITIVE, BELOW is NEGATIVE, 'at par' is 0. A Letter of Acceptance states this in a sentence rather than a table — 'your offer ... at 5.75% below the estimated cost is accepted' -> -5.75; 'quoted 3% excess' -> 3; '(-)7.5%' -> -7.5; 'at par' -> 0. Words to read as BELOW: below, less, discount, rebate, minus, (-). Words to read as ABOVE: above, excess, over, plus, (+). Return null if no such percentage is stated anywhere.",
  "rebatePercentage": "Any separately stated REBATE % (a discount on the accepted rates, sometimes offered in a later letter), as a positive number. Null if the document states no separate rebate. Do NOT repeat acceptedPercentage here — a below-estimate offer is not a rebate."
}`;

  // Schedules are NOT read. They were asked for so the form could pre-fill each
  // schedule's escalation and bid rate, and that pass was the whole cost of reading an
  // LOA: hundreds of item numbers, 16,000 tokens, its own copy of the PDF. The decision
  // is that those percentages are not needed from the document; anyone who wants them
  // types them on the contract form. The AI now reads the essentials and nothing else.

  // For a scanned LOA read via OCR, send the clean text instead of the page
  // image the model can't read; otherwise send the PDF as before.
  const withPdf = (text: string) => [
    {
      role: 'user',
      content: ocrText
        ? [{ type: 'text', text: `${text}\n\n--- DOCUMENT TEXT (read from a scanned PDF) ---\n${ocrText}` }]
        : [
            { type: 'file', file: { filename, file_data: dataUri } },
            { type: 'text', text },
          ],
    },
  ];

  // One shape for both outcomes: the project compiles without strict null checks, so a
  // discriminated union would not narrow on `ok` and every field read would fail to type.
  interface Ask {
    ok: boolean;
    extracted?: any;
    model?: string | null;
    kind?: 'network' | 'http' | 'unparseable';
    status?: number;
    outOfCredit?: boolean;
    detail?: string;
    truncated?: boolean;
  }

  const ask = async (text: string, maxTokens: number, label: string): Promise<Ask> => {
    const model = await getAiModel();
    let response: Response;
    try {
      response = await fetch(ABACUS_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model, messages: withPdf(text), response_format: { type: 'json_object' }, max_tokens: maxTokens, temperature: 0.1 }),
        signal: AbortSignal.timeout(90000),
      });
    } catch (err: any) {
      await recordAiUsage({ operation: 'agreement-extraction', success: false, errorType: 'network' });
      return { ok: false, kind: 'network', status: 502, detail: `${label}: network: ${err?.message || err}` };
    }
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      console.error(`agreement-extractor: ${label}: AI HTTP ${response.status}:`, body.slice(0, 500));
      const outOfCredit = response.status === 402 || /no remaining credits|insufficient credits|credit balance/i.test(body);
      await recordAiUsage({ operation: 'agreement-extraction', success: false, errorType: outOfCredit ? 'out_of_credit' : `http_${response.status}` });
      return { ok: false, kind: 'http', status: outOfCredit ? 402 : 502, outOfCredit, detail: `${label}: AI HTTP ${response.status}: ${body.slice(0, 300)}` };
    }
    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    const finishReason = String(data?.choices?.[0]?.finish_reason ?? 'unknown');
    try {
      const parsed = JSON.parse(content);
      if (!parsed || typeof parsed !== 'object') throw new Error('not an object');
      await recordAiUsage({ operation: 'agreement-extraction', model: data?.model, ...tokensFromUsage(data?.usage), success: true });
      return { ok: true, extracted: parsed, model: data?.model ?? null };
    } catch {
      const truncated = finishReason === 'length';
      console.error(`agreement-extractor: ${label}: unparseable AI reply (finish_reason=${finishReason}, ${String(content ?? '').length} chars):`, String(content ?? '').slice(-200));
      await recordAiUsage({ operation: 'agreement-extraction', model: data?.model, ...tokensFromUsage(data?.usage), success: false, errorType: truncated ? 'truncated' : 'parse_error' });
      return { ok: false, kind: 'unparseable', status: 502, truncated, detail: `${label}: finish_reason=${finishReason}, ${String(content ?? '').length} chars, model=${data?.model ?? '?'}` };
    }
  };

  // One small request, and one compact retry if the reply comes back unusable.
  const first = await ask(essentialsPrompt, 3000, 'essentials');
  const essentials = first.ok || first.kind !== 'unparseable'
    ? first
    : await ask(essentialsPrompt + '\n\nCOMPACT RETRY: the previous reply was cut off. Keep every text value under 400 characters. No prose, nothing outside the JSON object.', 3000, 'essentials retry');

  if (!essentials.ok) {
    // AI unavailable (out of credit, HTTP error, network, or an unreadable reply). If
    // the direct text pass read the document AND got the key fields, hand that back so
    // the user still gets a pre-filled form instead of a hard failure. "Enough" = it is
    // an agreement/LOA and carries an agreement or LOA number, so the flow can proceed.
    if (direct && direct.documentType === 'agreement' && (direct.agreementNo || direct.loaNo)) {
      console.log(`agreement-extractor: AI failed (${essentials.detail}); using the direct text read (${direct.filledCount} fields).`);
      const dateOfOpening = direct.closingDate || null;
      return {
        ok: true,
        warnings: ['Read without AI (the AI service was unavailable). Please check the fields before saving.'],
        data: {
          documentType: 'agreement',
          schedules: [],
          acceptedPercentage: direct.acceptedPercentage,
          rebatePercentage: null,
          agreementNo: direct.agreementNo,
          loaNo: direct.loaNo,
          loaDate: direct.loaDate,
          contractorName: direct.contractorName,
          contractorPhone: null,
          workDescription: direct.workDescription,
          dateOfOpening,
          closingDate: direct.closingDate,
          completionDate: null,
          completionPeriodMonths: direct.completionPeriodMonths,
          tenderAdvertisedValue: null,
          agreementAmount: null,
          railwayName: direct.railwayName,
          division: null,
        },
      };
    }
    if (essentials.kind === 'network') {
      return { ok: false, status: 502, error: 'The AI request failed. Please try again.', detail: essentials.detail };
    }
    if (essentials.kind === 'http') {
      return {
        ok: false,
        status: essentials.status ?? 502,
        error: essentials.outOfCredit
          ? 'The AI service is out of credit. Please try again later.'
          : 'Could not read the agreement (AI error). Please try again, or fill the form manually.',
        detail: essentials.detail,
      };
    }
    return {
      ok: false,
      status: 502,
      error: 'Could not read the agreement clearly. Our team has been notified; meanwhile the form can be filled in by hand.',
      detail: essentials.detail,
    };
  }

  const warnings: string[] = [];
  const extracted: any = { ...essentials.extracted };

  // Fill any essential the AI left blank from the direct text read — the AI stays the
  // primary reader, this only patches gaps (e.g. a number the model missed).
  if (direct) {
    for (const k of ['agreementNo', 'loaNo', 'loaDate', 'contractorName', 'workDescription', 'completionPeriodMonths'] as const) {
      if ((extracted[k] === null || extracted[k] === undefined || extracted[k] === '') && direct[k] != null) {
        extracted[k] = direct[k];
      }
    }
  }

  // The closing date decides the base month, and a base month that is out by a month
  // skews every quarter's PVC without ever looking wrong. Both agreements and LOAs
  // print it in plain words, so read it off the page and let that beat the model —
  // the AI is only the fallback here.
  const printedClosingDate = pdfText ? findClosingDateInText(pdfText) : await findPrintedClosingDate(Buffer.from(pdfBytes));
  if (printedClosingDate && printedClosingDate !== extracted.closingDate) {
    console.log(`agreement-extractor: closing date from the document text (${printedClosingDate}) overrides the AI's (${extracted.closingDate ?? 'none'})`);
    extracted.closingDate = printedClosingDate;
  }

  // Base-month rule: baseMonth = month BEFORE the closing date, and the server
  // derives it from dateOfOpening. So map the closing date onto dateOfOpening.
  const dateOfOpening = extracted.closingDate || extracted.dateOfOpening || null;

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
    if (/\bat\s*par\b/.test(text)) return 0;
    const digits = text.match(/-?\d+(?:\.\d+)?/);
    if (!digits) return null;
    let value = parseFloat(digits[0]);
    if (!isFinite(value)) return null;
    const saysBelow = /below|less|discount|rebate|minus|\(\s*-\s*\)|(^|[^\d.])-/.test(text);
    if (saysBelow) value = -Math.abs(value);
    return value;
  };

  // Nothing reads schedules any more; the field stays so callers keep their shape.
  const schedules: ExtractedSchedule[] = [];

  const docTypeRaw = String(extracted.documentType ?? '').trim().toLowerCase();
  const documentType: ExtractedAgreement['documentType'] =
    docTypeRaw === 'agreement' ? 'agreement' : docTypeRaw === 'bill' ? 'bill' : 'other';

  return {
    ok: true,
    warnings: warnings.length ? warnings : undefined,
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
