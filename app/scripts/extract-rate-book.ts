/**
 * Read a published schedule of rates into a flat list of items.
 *
 * Two books, two layouts, one reader. Both print a heading that opens a chapter and
 * then a fixed column grid — code, description, unit, rate — so the columns are read
 * by x position rather than by guessing at spaces in a joined string. What differs is
 * the page size, where the columns sit, and how a chapter announces itself; that is
 * what a profile holds.
 *
 *   dsr    CPWD Delhi Schedule of Rates. 595x842. "SUB HEAD : 5.0 REINFORCED CEMENT
 *          CONCRETE", codes like 5.35 and 5.35.1. Printed twice, English and Hindi.
 *   ussor  Indian Railways Unified Standard Schedule of Rates. 612x792.
 *          "CHAPTER - 4 : Bridge Works - Super Structure (Steel)", six-digit codes.
 *
 * Usage: npx tsx scripts/extract-rate-book.ts <profile> <pdf> [out.json]
 */
import { readFileSync, writeFileSync } from 'fs';

export interface RateBookItem {
  code: string;
  subHead: string;
  subHeadName: string;
  description: string;
  unit: string;
  rate: number | null;
  page: number;
}

interface Profile {
  /** Opens a chapter: captures its number and its name. */
  head: RegExp;
  /** A code in the first column. */
  code: RegExp;
  /** Right edge of the code column, left edge of unit, left edge of rate. */
  x: { codeMax: number; unit: number; rate: number };
  /** Pages to skip outright — the same book printed in another script. */
  skip?: RegExp;
  /** A parent item whose wording its children inherit ends this way. */
  parentEnds: RegExp;
  /**
   * How a child is recognised.
   *
   * 'prefix' — DSR numbers them inside the parent: 7.29 holds the wording, 7.29.1 and
   * 7.29.2 are its variants.
   * 'order'  — USSOR gives every row its own six-digit code, so nesting is by position
   * alone: an unpriced heading, then the priced rows beneath it until the next
   * heading. Its children print only what tells them apart — "1 in 8½ Turnout",
   * "52 Kg - 90 UTS - Outside Track" — which is meaningless without the heading above.
   */
  nesting: 'prefix' | 'order';
}

const PROFILES: Record<string, Profile> = {
  dsr: {
    head: /SUB\s*HEAD\s*:\s*(\d{1,2}\.\d)\s+([A-Z][A-Z0-9 ,&./()-]{2,60})/,
    code: /^\d{1,2}\.\d{1,3}(?:\.\d{1,3})*$/,
    x: { codeMax: 160, unit: 415, rate: 470 },
    // The Hindi half, recognised by its own column headers as the legacy Devanagari
    // font transliterates them: कोड सं0 → "dksM la0", विवरण → "fooj.k", इकाई → "bdkbZ".
    skip: /fooj\.k|bdkbZ|dksM\s+la0|ewy\s+njsa|mi”kh’kZ/,
    parentEnds: /:$/,
    nesting: 'prefix',
  },
  ussor: {
    head: /CHAPTER\s*-?\s*(\d{1,2})\s*:\s*([A-Za-z][A-Za-z0-9 ,&./()-]{2,70})/,
    code: /^\d{6}$/,
    x: { codeMax: 140, unit: 430, rate: 480 },
    parentEnds: /:$/,
    nesting: 'order',
  },
};

/** Units these books actually print. Anything else in that column is a misread. */
const UNITS = new Set(['sqm', 'cum', 'metre', 'm', 'rm', 'trm', 'cm', 'mm', 'each', 'kg', 'quintal',
  'qtl', 'tonne', 'mt', 'litre', 'nos', 'no', 'no.', 'day', 'set', 'pair', 'point', 'hour',
  'week', 'month', 'job', 'unit', 'per', 'gm', 'ml', 'bag', 'roll', 'coat', 'tree', 'plant', 'sq.m', 'cu.m']);

const ENGLISH_WORDS = /\b(?:of|and|the|with|in|for|as|per|including|complete|providing|fixing|dia|thick|mm|cm|cement|work|rate|item)\b/gi;

type Token = { x: number; text: string };

function linesOf(items: any[], height: number): Token[][] {
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
    .map(([, tokens]) => tokens.sort((left, right) => left.x - right.x));
}

export async function extractRateBook(pdfPath: string, profileName: string): Promise<RateBookItem[]> {
  const profile = PROFILES[profileName];
  if (!profile) throw new Error(`Unknown profile "${profileName}". Known: ${Object.keys(PROFILES).join(', ')}`);

  const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(pdfPath)), useSystemFonts: true }).promise;

  const out: RateBookItem[] = [];
  let subHead = '';
  let subHeadName = '';
  let parent: { code: string; text: string } | null = null;
  let current: (RateBookItem & { parts: string[] }) | null = null;

  const flush = () => {
    if (!current) return;
    const own = current.parts.join(' ').replace(/\s+/g, ' ').trim();
    const isChild = parent !== null
      && (profile.nesting === 'order' || current.code.startsWith(`${parent.code}.`));
    current.description = (isChild ? `${parent!.text} ${own}` : own).replace(/\s+/g, ' ').trim();
    // A heading carries wording but no price. USSOR prints them without a unit as well,
    // which is what tells a heading apart from a priced row ending in a colon.
    const isHeading = current.rate === null
      && (profile.nesting === 'order' ? current.unit === '' : profile.parentEnds.test(own));
    if (isHeading) {
      parent = { code: current.code, text: own.replace(/\s*:$/, '') };
    }
    // A real item reads as a sentence in English. Page-level filtering is not enough:
    // some pages print both languages, and a transliterated row came through as a run
    // of syllables — "vkj-lh-lh- ikbi" is आर.सी.सी. पाइप. Two ordinary English words is
    // a low bar that no such row clears.
    // ...but a row with a real unit and a price is an item whatever its wording says.
    // "52 Kg - 90 UTS - Outside Track" carries no ordinary English word and is still a
    // priced item of the schedule. Only a misread row lacks both a unit and a rate.
    const priced = current.unit !== '' && current.rate !== null;
    if (priced || (current.description.match(ENGLISH_WORDS)?.length ?? 0) >= 2) {
      out.push({ ...current } as RateBookItem);
    }
    current = null;
  };

  for (let n = 1; n <= doc.numPages; n += 1) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();
    const height = page.getViewport({ scale: 1 }).height;
    const joined = content.items.map((item: any) => item.str).join(' ');
    if (profile.skip?.test(joined)) continue;
    if (!ENGLISH_WORDS.test(joined)) { ENGLISH_WORDS.lastIndex = 0; continue; }
    ENGLISH_WORDS.lastIndex = 0;

    for (const tokens of linesOf(content.items as any[], height)) {
      const text = tokens.map(token => token.text).join(' ').replace(/\s+/g, ' ').trim();
      const head = text.match(profile.head);
      if (head) {
        flush();
        [, subHead, subHeadName] = head;
        subHeadName = subHeadName
          .replace(/\s+(?:Code|Item)\b.*$/i, '')
          // A chapter that opens mid-page is followed on the same line by its first
          // codes; the name ends where the first of them begins.
          .replace(/\s+\d{1,2}\.\d.*$/, '')
          .replace(/\s+\d{4,6}\b.*$/, '')
          .replace(/\s+\d{1,4}$/, '')
          .trim();
        parent = null;
        continue;
      }
      if (!subHead) continue;
      if (/^(?:Code|Item)\s*No\.?$|^No\.$|^Description\b|^Unit$|^Rate\b/i.test(text)) continue;

      const first = tokens[0];
      const startsItem = first.x < profile.x.codeMax && profile.code.test(first.text.trim());
      if (startsItem) {
        flush();
        current = {
          code: first.text.trim(), subHead, subHeadName,
          description: '', unit: '', rate: null, page: n, parts: [],
        };
      }
      if (!current) continue;

      for (const token of tokens) {
        if (startsItem && token === first) continue;
        const value = token.text.trim();
        if (!value) continue;
        if (token.x >= profile.x.rate) {
          const rate = Number(value.replace(/[,₹]/g, ''));
          if (Number.isFinite(rate) && current.rate === null) current.rate = rate;
        } else if (token.x >= profile.x.unit) {
          // Some pages print a rates matrix, so text lands in the unit column that is
          // not a unit. Taking only real units keeps those rows from claiming a rate
          // belonging to another column.
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
  const [profile, pdfPath, outFile] = process.argv.slice(2);
  if (!profile || !pdfPath) {
    console.error('Usage: npx tsx scripts/extract-rate-book.ts <dsr|ussor> <pdf> [out.json]');
    process.exit(1);
  }
  const items = await extractRateBook(pdfPath, profile);
  const byHead = new Map<string, number>();
  for (const item of items) {
    const key = `${item.subHead} ${item.subHeadName}`;
    byHead.set(key, (byHead.get(key) || 0) + 1);
  }
  console.log(`${items.length} items, ${byHead.size} chapters`);
  for (const [name, count] of byHead) console.log(`  ${String(count).padStart(4)}  ${name}`);
  const priced = items.filter(item => item.rate !== null).length;
  console.log(`priced: ${priced}   headings (no rate): ${items.length - priced}`);
  if (outFile) {
    writeFileSync(outFile, JSON.stringify({ items }, null, 1));
    console.log(`written to ${outFile}`);
  }
}

if (require.main === module) main().catch(error => { console.error(error); process.exit(1); });
