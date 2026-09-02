/**
 * Reads a scanned JPC "Retail Market Price" sheet.
 *
 * The Joint Plant Committee publishes these twice a month as a fixed 24-row table —
 * item against Kolkata, Delhi, Mumbai and Chennai, in rupees per tonne — and they
 * arrive as photocopier scans with no text layer, so the positional reader that handles
 * IREPS bills cannot touch them. They go to the same AI the agreement extractor uses.
 *
 * Nothing here writes anything. It returns what it read, for a human to check against
 * the sheet before saving: a misread digit moves the steel component of every PVC in
 * the system, and unlike a bill there is no printed total to reconcile against.
 */

import { recordAiUsage, tokensFromUsage } from '@/lib/ai-usage';
import { JPC_ITEMS } from '@/lib/jpc-items';

const ABACUS_ENDPOINT = 'https://routellm.abacus.ai/v1/chat/completions';

export const JPC_CITIES = ['Kolkata', 'Delhi', 'Mumbai', 'Chennai'] as const;
export type JpcCity = typeof JPC_CITIES[number];

export interface JpcExtractedRow {
  /** Serial number printed on the sheet, 1-24. */
  sno: number;
  /** The item exactly as printed, e.g. "TMT 10 MM". */
  item: string;
  /** The JPC_ITEMS id this row was matched to, or null when it matched nothing. */
  itemCode: string | null;
  /** Rupees per tonne per city. Null where the sheet prints NA. */
  prices: Record<JpcCity, number | null>;
}

export interface JpcExtraction {
  ok: boolean;
  status?: number;
  error?: string;
  data?: {
    /** The date the prices are FOR, as printed: "RETAIL MARKET PRICE DURING ...". */
    priceDate: string | null;
    /** YYYY-MM derived from that date. */
    month: string | null;
    /** First or second half of the month — which fortnight column this sheet fills. */
    fortnight: 'f1' | 'f2' | null;
    rows: JpcExtractedRow[];
    /** Rows the sheet has that we could not match to a known item, by name. */
    unmatched: string[];
    /** Known items the sheet did not yield — these would be left blank. */
    missing: string[];
  };
}

/** "2ND MAY 2026" / "15TH MAY 2026" -> { month: '2026-05', fortnight } */
export function parsePriceDate(raw: string | null | undefined): { month: string | null; fortnight: 'f1' | 'f2' | null } {
  const text = String(raw || '').trim();
  const m = text.match(/(\d{1,2})\s*(?:ST|ND|RD|TH)?\s+([A-Za-z]+)\s+(\d{4})/i);
  if (!m) return { month: null, fortnight: null };
  const day = Number(m[1]);
  const monthIndex = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
    .indexOf(m[2].slice(0, 3).toLowerCase());
  if (monthIndex < 0 || !day) return { month: null, fortnight: null };
  return {
    month: `${m[3]}-${String(monthIndex + 1).padStart(2, '0')}`,
    // JPC prices the 1st and the 15th; anything before the 15th is the first fortnight.
    fortnight: day < 15 ? 'f1' : 'f2',
  };
}

/** Loose match against the printed item names — spacing and punctuation vary between sheets. */
export function matchItemCode(printed: string): string | null {
  const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const target = norm(printed);
  if (!target) return null;
  const exact = JPC_ITEMS.find(item => norm(item.name) === target);
  if (exact) return exact.id;
  // "ANGLES 75X75X6 MM (ISA 75x6)" in our list vs "ANGLES 75X75X6 MM" on the sheet.
  const prefix = JPC_ITEMS.find(item => norm(item.name).startsWith(target) || target.startsWith(norm(item.name)));
  return prefix ? prefix.id : null;
}

export async function extractJpcSheet(pdf: Buffer, filename: string): Promise<JpcExtraction> {
  const apiKey = process.env.ABACUSAI_API_KEY;
  if (!apiKey) return { ok: false, status: 503, error: 'AI service is not configured.' };

  const dataUri = `data:application/pdf;base64,${pdf.toString('base64')}`;
  const prompt = `This is a scanned Joint Plant Committee (JPC) "RETAIL MARKET PRICE" sheet from India. Read the table exactly.

Return ONLY raw JSON (no markdown, no code fences):
{
  "priceDate": "the date the prices are FOR, taken from the heading 'RETAIL MARKET PRICE DURING ...', e.g. '2ND MAY 2026'",
  "rows": [
    { "sno": 1, "item": "PIG IRON", "kolkata": 46220, "delhi": 50150, "mumbai": 56050, "chennai": null }
  ]
}

Rules:
- One object per printed row, in the printed order, usually 24 rows.
- "item" must be copied exactly as printed, including sizes, e.g. "TMT 10 MM", "ANGLES 75X75X6 MM".
- Prices are whole rupees per tonne. Return them as plain numbers with no commas.
- Where the sheet prints "NA" (or the cell is empty), return null for that city — never 0, and never a guess.
- Do not calculate, average or infer anything. Copy the digits you can see. If a digit is unclear, return null for that cell rather than guessing.`;

  let response: Response;
  try {
    response = await fetch(ABACUS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'route-llm',
        messages: [{ role: 'user', content: [
          { type: 'file', file: { filename, file_data: dataUri } },
          { type: 'text', text: prompt },
        ] }],
        response_format: { type: 'json_object' },
        max_tokens: 3000,
        temperature: 0,
      }),
      signal: AbortSignal.timeout(90000),
    });
  } catch {
    await recordAiUsage({ operation: 'jpc-extraction', success: false, errorType: 'network' });
    return { ok: false, status: 502, error: 'The AI request failed. Please try again.' };
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    const outOfCredit = response.status === 402 || /no remaining credits|insufficient credits/i.test(text);
    await recordAiUsage({ operation: 'jpc-extraction', success: false, errorType: outOfCredit ? 'out_of_credit' : `http_${response.status}` });
    return {
      ok: false,
      status: outOfCredit ? 402 : 502,
      error: outOfCredit ? 'The AI service is out of credit.' : `Could not read the sheet (AI error ${response.status}).`,
    };
  }

  const payload = await response.json();
  let parsed: any;
  try {
    parsed = JSON.parse(payload?.choices?.[0]?.message?.content);
  } catch {
    await recordAiUsage({ operation: 'jpc-extraction', success: false, errorType: 'parse_error' });
    return { ok: false, status: 502, error: 'Could not read the sheet clearly. Try a sharper scan.' };
  }

  await recordAiUsage({
    operation: 'jpc-extraction',
    model: payload?.model,
    ...tokensFromUsage(payload?.usage),
    success: true,
  });

  const num = (v: unknown): number | null => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(String(v).replace(/,/g, '').trim());
    // A JPC price is a five-figure rupee-per-tonne number; anything else is a misread.
    return Number.isFinite(n) && n > 0 ? n : null;
  };

  const rows: JpcExtractedRow[] = (Array.isArray(parsed?.rows) ? parsed.rows : []).map((r: any) => ({
    sno: Number(r?.sno) || 0,
    item: String(r?.item || '').trim(),
    itemCode: matchItemCode(String(r?.item || '')),
    prices: {
      Kolkata: num(r?.kolkata),
      Delhi: num(r?.delhi),
      Mumbai: num(r?.mumbai),
      Chennai: num(r?.chennai),
    },
  }));

  const seen = new Set(rows.map(r => r.itemCode).filter(Boolean) as string[]);
  const { month, fortnight } = parsePriceDate(parsed?.priceDate);

  return {
    ok: true,
    data: {
      priceDate: parsed?.priceDate ? String(parsed.priceDate) : null,
      month,
      fortnight,
      rows,
      unmatched: rows.filter(r => !r.itemCode && r.item).map(r => r.item),
      missing: JPC_ITEMS.filter(item => !seen.has(item.id)).map(item => item.name),
    },
  };
}

/**
 * Reads a multi-page JPC PDF — a month's two fortnights, or several months bound
 * together — by splitting it and reading each page as its own sheet.
 *
 * The single-sheet reader is prompted for ONE table, so a bound PDF used to yield only
 * its first page and the rest silently vanished. Pages that are not price pages (each
 * fortnight's items-25-34 page, disclaimers) identify themselves by failing to match
 * known items, and are dropped rather than guessed at. Duplicate (month, fortnight)
 * readings keep whichever page yielded more prices.
 */
export async function extractJpcSheets(
  pdf: Buffer,
  filename: string,
): Promise<{ ok: boolean; status?: number; error?: string; sheets?: NonNullable<JpcExtraction['data']>[]; pagesTotal?: number; pagesSkipped?: number }> {
  const { PDFDocument } = await import('pdf-lib');
  let pageCount = 1;
  let source: Awaited<ReturnType<typeof PDFDocument.load>> | null = null;
  try {
    source = await PDFDocument.load(pdf);
    pageCount = source.getPageCount();
  } catch {
    // Not splittable — treat as a single sheet and let the reader report what it can.
  }

  if (!source || pageCount <= 1) {
    const single = await extractJpcSheet(pdf, filename);
    if (!single.ok) return { ok: false, status: single.status, error: single.error };
    return { ok: true, sheets: [single.data!], pagesTotal: 1, pagesSkipped: 0 };
  }

  // Each page costs one AI reading — a bound year would cost seventy. Ask for smaller
  // uploads instead of silently reading a fraction.
  const MAX_PAGES = 12;
  if (pageCount > MAX_PAGES) {
    return {
      ok: false,
      status: 400,
      error: `That PDF has ${pageCount} pages. Upload one or two months at a time (up to ${MAX_PAGES} pages).`,
    };
  }

  // Split into single-page PDFs and read them a few at a time.
  const pageBuffers: Buffer[] = [];
  for (let i = 0; i < pageCount; i++) {
    const onePage = await PDFDocument.create();
    const [page] = await onePage.copyPages(source, [i]);
    onePage.addPage(page);
    pageBuffers.push(Buffer.from(await onePage.save()));
  }

  const results: (JpcExtraction | null)[] = new Array(pageCount).fill(null);
  const CONCURRENCY = 3;
  for (let start = 0; start < pageCount; start += CONCURRENCY) {
    const batch = pageBuffers.slice(start, start + CONCURRENCY).map((buffer, offset) =>
      extractJpcSheet(buffer, `${filename} (page ${start + offset + 1})`).then(r => { results[start + offset] = r; }),
    );
    await Promise.all(batch);
  }

  // A price page matches most of the 24 known items; other pages match almost none.
  const MIN_MATCHED_ROWS = 8;
  const byKey = new Map<string, NonNullable<JpcExtraction['data']>>();
  let skipped = 0;
  for (const result of results) {
    const data = result?.ok ? result.data : null;
    const matched = data ? data.rows.filter(r => r.itemCode).length : 0;
    if (!data || matched < MIN_MATCHED_ROWS) {
      skipped++;
      continue;
    }
    const key = `${data.month || 'unknown'}|${data.fortnight || 'unknown'}`;
    const existing = byKey.get(key);
    const pricedCount = (d: NonNullable<JpcExtraction['data']>) =>
      d.rows.filter(r => Object.values(r.prices).some(v => v !== null)).length;
    if (!existing || pricedCount(data) > pricedCount(existing)) byKey.set(key, data);
  }

  const sheets = [...byKey.values()].sort((a, b) => `${a.month}|${a.fortnight}`.localeCompare(`${b.month}|${b.fortnight}`));
  if (sheets.length === 0) {
    return { ok: false, status: 422, error: 'No page of that PDF read as a JPC price table.' };
  }
  return { ok: true, sheets, pagesTotal: pageCount, pagesSkipped: skipped };
}
