/**
 * Read a CPWD Delhi Schedule of Rates PDF into a flat list of items.
 *
 * The book is printed twice, English and Hindi, and the Hindi half carries a legacy
 * Devanagari font whose text layer extracts as transliterated noise ("dksM la0" for
 * कोड सं0). Only the English pages are read; the Hindi ones are recognised by the
 * absence of ordinary English words and skipped.
 *
 * On an English page the layout is a fixed four-column grid — Code No. at x≈64 (x≈113
 * for a sub-item), Description from x≈112, Unit at x≈431, Rate at x≈493 — so the
 * columns are read by position rather than by guessing at spaces in a joined string.
 *
 * A parent item carries the wording and ends in a colon, and its priced children carry
 * only what distinguishes them ("Red sand stone"). Each child is stored with its
 * parent's wording prefixed, because a description of "Red sand stone" on its own says
 * nothing about what is being done with it.
 *
 * Usage: npx tsx scripts/extract-dsr-book.ts <pdf> <edition> [outfile.json]
 */
import { readFileSync, writeFileSync } from 'fs';

export interface DsrBookItem {
  code: string;
  subHead: string;
  subHeadName: string;
  description: string;
  unit: string;
  rate: number | null;
  page: number;
}

const ENGLISH_MARKER = /\b(?:Providing|providing|Supplying|supplying|Description|cement|concrete|Rate|including)\b/;

/**
 * The Hindi half of the book, recognised by its own column headers as the legacy font
 * transliterates them — कोड सं0 → "dksM la0", विवरण → "fooj.k", इकाई → "bdkbZ",
 * मूल दरें → "ewy njsa", उपशीर्ष → "mi”kh’kZ". A Hindi page carries enough stray English
 * (units, figures, an odd loanword) to pass the marker test above on its own, and the
 * rows it yielded were runs of digits and syllables like "fe-eh- C;kl okys".
 */
const HINDI_MARKER = /fooj\.k|bdkbZ|dksM\s+la0|ewy\s+njsa|mi”kh’kZ/;

/** Units the book actually prints. Anything else in that column is a misread. */
const UNITS = new Set(['sqm', 'cum', 'metre', 'm', 'rm', 'cm', 'mm', 'each', 'kg', 'quintal',
  'tonne', 'litre', 'nos', 'no', 'no.', 'day', 'set', 'pair', 'sqm.', 'cum.', 'point', 'hour',
  'week', 'month', 'job', 'unit', 'per', 'gm', 'ml', 'bag', 'roll', 'coat', 'tree', 'plant']);
const CODE = /^\d{1,2}\.\d{1,3}(?:\.\d{1,3})*$/;
const SUB_HEAD = /SUB\s*HEAD\s*:\s*(\d{1,2}\.\d)\s+([A-Z][A-Z0-9 ,&./()-]{2,60})/;

// Column edges, in PDF points on the 595pt-wide page.
const X_CODE_MAX = 160;
const X_UNIT = 415;
const X_RATE = 470;

type Token = { x: number; text: string };

function linesOf(items: any[], height: number): { y: number; tokens: Token[] }[] {
  const rows = new Map<number, Token[]>();
  for (const item of items) {
    if (!String(item.str).trim()) continue;
    const y = Math.round(height - item.transform[5]);
    const key = [...rows.keys()].find(candidate => Math.abs(candidate - y) <= 2) ?? y;
    if (!rows.has(key)) rows.set(key, []);
    rows.get(key)!.push({ x: Math.round(item.transform[4]), text: String(item.str) });
  }
  return [...rows.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([y, tokens]) => ({ y, tokens: tokens.sort((left, right) => left.x - right.x) }));
}

export async function extractDsrBook(pdfPath: string): Promise<DsrBookItem[]> {
  const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(pdfPath)), useSystemFonts: true }).promise;

  const out: DsrBookItem[] = [];
  let subHead = '';
  let subHeadName = '';
  // The last unpriced parent, whose wording its children inherit.
  let parent: { code: string; text: string } | null = null;
  let current: (DsrBookItem & { parts: string[] }) | null = null;

  const flush = () => {
    if (!current) return;
    const own = current.parts.join(' ').replace(/\s+/g, ' ').trim();
    const isChild = parent && current.code.startsWith(`${parent.code}.`);
    current.description = (isChild ? `${parent!.text} ${own}` : own).replace(/\s+/g, ' ').trim();
    if (current.rate === null && /:$/.test(own)) {
      // An unpriced item ending in a colon is a heading for the items beneath it.
      parent = { code: current.code, text: own.replace(/\s*:$/, '') };
    }
    // A real item reads as a sentence in English. Page-level filtering is not enough:
    // some pages print both languages, and the Hindi rows there came through as runs of
    // syllables — "vkj-lh-lh- ikbi] LVhy dksjnkj" is आर.सी.सी. पाइप in the legacy font.
    // Two ordinary English words is a low bar that no transliterated row clears.
    const englishWords = current.description
      .match(/\b(?:of|and|the|with|in|for|as|per|including|complete|providing|fixing|dia|thick|mm|cm|cement|work)\b/gi);
    if ((englishWords?.length ?? 0) >= 2) {
      out.push({ ...current } as DsrBookItem);
    }
    current = null;
  };

  for (let n = 1; n <= doc.numPages; n += 1) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();
    const height = page.getViewport({ scale: 1 }).height;
    const joined = content.items.map((item: any) => item.str).join(' ');
    if (!ENGLISH_MARKER.test(joined) || HINDI_MARKER.test(joined)) continue;

    for (const line of linesOf(content.items as any[], height)) {
      const text = line.tokens.map(token => token.text).join(' ').replace(/\s+/g, ' ').trim();
      const head = text.match(SUB_HEAD);
      if (head) {
        flush();
        [, subHead, subHeadName] = head;
        // The running page number prints on the same line as the sub-head, on either
        // side of it, and the column headers follow it — neither belongs to the name.
        subHeadName = subHeadName
          .replace(/\s+Code\b.*$/i, '')
          // A sub-head that opens mid-page is followed on the same line by the first
          // item codes; the name ends where the first of them begins.
          .replace(/\s+\d{1,2}\.\d.*$/, '')
          .replace(/\s+\d{1,4}$/, '')
          .trim();
        parent = null;
        continue;
      }
      if (!subHead) continue;
      if (/^Code\b|^No\.$|^Description\b/i.test(text)) continue;

      const first = line.tokens[0];
      const startsItem = first.x < X_CODE_MAX && CODE.test(first.text.trim());
      if (startsItem) {
        flush();
        current = {
          code: first.text.trim(), subHead, subHeadName,
          description: '', unit: '', rate: null, page: n, parts: [],
        };
      }
      if (!current) continue;

      for (const token of line.tokens) {
        if (startsItem && token === first) continue;
        const value = token.text.trim();
        if (!value) continue;
        if (token.x >= X_RATE) {
          const rate = Number(value.replace(/,/g, ''));
          if (Number.isFinite(rate)) current.rate = rate;
        } else if (token.x >= X_UNIT) {
          // Sub-head 1.0 prints carriage rates as a matrix of several distance columns,
          // so text lands in the unit column that is not a unit. Taking only real units
          // keeps those rows from claiming a rate that belongs to another column.
          if (UNITS.has(value.toLowerCase())) current.unit = value;
        } else {
          current.parts.push(value);
        }
      }
    }
    flush();
  }
  return out;
}

async function main() {
  const [pdfPath, edition, outFile] = process.argv.slice(2);
  if (!pdfPath || !edition) {
    console.error('Usage: npx tsx scripts/extract-dsr-book.ts <pdf> <edition> [out.json]');
    process.exit(1);
  }
  const items = await extractDsrBook(pdfPath);
  const bySubHead = new Map<string, number>();
  for (const item of items) bySubHead.set(`${item.subHead} ${item.subHeadName}`, (bySubHead.get(`${item.subHead} ${item.subHeadName}`) || 0) + 1);
  console.log(`${items.length} items, ${bySubHead.size} sub-heads`);
  for (const [name, count] of bySubHead) console.log(`  ${String(count).padStart(4)}  ${name}`);
  const priced = items.filter(item => item.rate !== null).length;
  console.log(`priced: ${priced}   headings (no rate): ${items.length - priced}`);
  if (outFile) {
    writeFileSync(outFile, JSON.stringify({ edition, items }, null, 1));
    console.log(`written to ${outFile}`);
  }
}

if (require.main === module) main().catch(error => { console.error(error); process.exit(1); });
