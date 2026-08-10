import { extractPositionedPdfPages, PositionedPdfPage, PositionedPdfTextItem } from './pdf-layout-extract';
import type { DeterministicBillDetails, DeterministicBillItem } from './ireps-bill-parser';

// The unit column anchors a data row: a row whose unit is not listed here is never
// even considered. "Hour" was missing, so a dewatering item billed in HP Hour went
// unread and B-7 of SER/KGP/Civil/2024/0066 came out Rs 73,139 short.
//
// Note "HP" is deliberately absent. That unit prints as "HP" and "Hour" on two lines,
// and matching both would anchor the same physical row twice and count its amount
// twice — silently inflating the bill, which is far worse than failing to read it.
// The duplicate guard below is the backstop if a pair like that ever slips in.
// "TRM" is track running metre — five rows of SR/TPJ/Civil/2025/0067/B8 were billed in
// it, went unanchored, and left the bill Rs 83,571.79 short.
// "Shift" and "Night" price a track machine or a traffic block by the turn worked, and
// "Kilometre" spells out what "Km" abbreviates elsewhere on the same bill. Item NS2 of
// SR/MDU/Civil/2025/0070/B1/R1 is billed in Shifts and went unanchored, leaving that
// bill Rs 13,335 short — the whole of the row.
const UNIT_PATTERN = /^(?:Cum|Cu\.?m\.?|Sqm|Sq\.?m\.?|Kg|MT|M\.?T\.?|Metre|Meter|Kilo\s*met(?:re|er)|Each|Num|Nos?\.?|RM|Rmt|TRM|Km|Litre|Ltr|Set|Job|LS|Shifts?|Nights?|Hours?|Hrs?|Days?|Quintal|Qtl|Tonne|Pair|Bags?|Sqft|Cft|Joints?|ERC|Numbers?|MT-?Km|Tonne-?Km)$/i;
const NUMBER_PATTERN = /^-?[\d,]+(?:\.\d*)?$/;
const X = {
  serial: [50, 88],
  item: [88, 126],
  unit: [126, 163],
  baseRate: [163, 220],
  agreementRate: [220, 295],
  originalQty: [295, 332],
  currentQty: [332, 370],
  qtyUptoLast: [370, 408],
  qtySinceLast: [408, 445],
  qtyUptoDate: [445, 483],
  amountUptoLast: [483, 539],
  amountSinceLast: [539, 596],
  specialAmount: [596, 652],
  totalUptoDate: [652, 708],
} as const;

function normalizedX(page: PositionedPdfPage, item: PositionedPdfTextItem) {
  return item.x * (842 / page.width);
}

function numericValue(raw: string) {
  const value = Number(raw.replace(/,/g, '').replace(/\s+/g, ''));
  return Number.isFinite(value) ? value : undefined;
}

function cellText(
  page: PositionedPdfPage,
  items: PositionedPdfTextItem[],
  range: readonly [number, number],
  rowY: number,
  tolerance = 12,
) {
  return items
    .filter(item => {
      const x = normalizedX(page, item);
      return x >= range[0] && x < range[1] && Math.abs(item.y - rowY) <= tolerance;
    })
    .sort((left, right) => left.y - right.y || normalizedX(page, left) - normalizedX(page, right))
    .map(item => item.text.trim())
    .filter(Boolean)
    .join('')
    .replace(/\s+/g, '');
}

// A table row can straddle a page break: IREPS prints the integer part of each
// figure at the foot of one page and the remaining digits on the very first line
// of the next, in the same columns. Returns that first line's items.
function pageTopItems(page: PositionedPdfPage | undefined): PositionedPdfTextItem[] {
  if (!page || !page.items.length) return [];
  const topY = Math.min(...page.items.map(item => item.y));
  return page.items.filter(item => item.y <= topY + 3);
}

// The digits continuing a column, taken from the next page's first line.
function continuationDigits(
  nextPage: PositionedPdfPage | undefined,
  topItems: PositionedPdfTextItem[],
  range: readonly [number, number],
) {
  if (!nextPage) return '';
  return topItems
    .filter(item => {
      const x = normalizedX(nextPage, item);
      return x >= range[0] && x < range[1] && /^\d+$/.test(item.text.trim());
    })
    .sort((left, right) => left.x - right.x)
    .map(item => item.text.trim())
    .join('');
}

function pageLines(page: PositionedPdfPage) {
  const sorted = [...page.items].sort((left, right) => left.y - right.y || left.x - right.x);
  const lines: Array<{ y: number; text: string }> = [];
  for (const item of sorted) {
    const line = lines.find(candidate => Math.abs(candidate.y - item.y) <= 2.5);
    if (line) line.text += ` ${item.text}`;
    else lines.push({ y: item.y, text: item.text });
  }
  return lines.sort((left, right) => left.y - right.y);
}

function pagePlainText(page: PositionedPdfPage) {
  return pageLines(page).map(line => line.text.replace(/\s+/g, ' ').trim()).join('\n');
}

/**
 * Lines that read as data rows but were never anchored.
 *
 * A row is anchored by its unit, so a unit the reader does not know makes the row
 * invisible — and a shortfall with no skipped rows is exactly that. A line with a
 * numeric agreement rate AND a numeric amount in their own columns is a data row
 * whatever its unit says, so the ones that no unit matched are the rows that went
 * missing, and their amounts should account for the gap.
 */
function findUnanchoredRows(pages: PositionedPdfPage[]): Array<{ page: number; unit: string; amount: number }> {
  const missed: Array<{ page: number; unit: string; amount: number }> = [];
  for (const page of pages) {
    const seen = new Set<number>();
    for (const item of page.items) {
      const x = normalizedX(page, item);
      if (x < X.unit[0] || x >= X.unit[1]) continue;
      const y = Math.round(item.y);
      if (seen.has(y)) continue;
      seen.add(y);

      const unitCell = cellText(page, page.items, X.unit, item.y);
      if (UNIT_PATTERN.test(item.text.trim()) || UNIT_PATTERN.test(unitCell)) continue;

      const rate = numericValue(cellText(page, page.items, X.agreementRate, item.y));
      const special = numericValue(cellText(page, page.items, X.specialAmount, item.y));
      const plain = numericValue(cellText(page, page.items, X.amountSinceLast, item.y));
      const amount = special !== undefined && special !== 0 ? special : plain;
      if (!(rate && rate > 0) || amount === undefined) continue;

      missed.push({ page: page.pageNumber, unit: unitCell.slice(0, 24), amount });
    }
  }
  return missed;
}

function extractItemCode(
  page: PositionedPdfPage,
  rowY: number,
  nextRowY: number,
  // Item-column tokens carried over from the next page when this row straddles a
  // page break — a six-digit USSOR code prints as "0510" + "80" across the join.
  continuedTokens: string[] = [],
) {
  // A token in the item column belongs to whichever row it sits nearer to. The window
  // used to run to nextRowY - 3, but a row's code is printed only about four units
  // above its own line, so a widely-spaced row swallowed the NEXT row's code and
  // glued it on as a suffix: item 5.9.2 of SR/MDU/Civil/2024/0037/B8 came out
  // "5.9.2.0510", taking 0510 from the row below and inventing a DSR code that does
  // not exist. A fixed margin cannot work — the code sits above its line on some rows
  // and forty units below it on others — but the midpoint always separates them.
  const rowBoundary = (rowY + nextRowY) / 2;
  const pageTokens = page.items
    .filter(item => {
      const x = normalizedX(page, item);
      return x >= X.item[0] && x < X.item[1] && item.y >= rowY - 12 && item.y < rowBoundary;
    })
    .sort((left, right) => left.y - right.y)
    .map(item => item.text.replace(/[()IG\s-]/gi, '').trim())
    .filter(Boolean);
  const carried = continuedTokens.map(token => token.replace(/[()IG\s-]/gi, '').trim()).filter(Boolean);
  const itemTokens = pageTokens;
  // The code is read from this page only. A token from the next page may complete a
  // code but must never start one, or the last row of a page would take the code of
  // the first row of the next.
  const base = pageTokens.find(token => /^\d+(?:\.\d+)*\.?$/.test(token))?.replace(/\.$/, '') || '';
  if (/^\d{4}$/.test(base)) {
    // A six-digit USSOR code is printed on two lines — "0820" above "11" — and when the
    // row is the last on its page, the second line is printed at the top of the next
    // one. The bill then yielded "0820", which is no item at all: item 082012 of
    // SR/TPJ/Civil/2025/0067/B7 came out that way, and 171024 with it.
    const suffix = pageTokens.find(token => token !== base && /^\d{1,2}$/.test(token))
      ?? carried.find(token => /^\d{1,2}$/.test(token));
    if (suffix) return `${base}${suffix.padStart(2, '0')}`;
  }
  if (base === '00') {
    const serial = page.items
      .filter(item => {
        const x = normalizedX(page, item);
        return x >= X.serial[0] && x < X.serial[1] && item.y >= rowY - 12 && item.y < nextRowY - 3;
      })
      .map(item => item.text.trim())
      .find(token => /^\d+$/.test(token));
    if (serial) return `${serial}00`;
  }
  if (base.includes('.')) {
    const baseIndex = itemTokens.indexOf(base);
    const suffix = itemTokens.slice(baseIndex + 1).find(token => /^\.?\d+(?:\.\d+)*$/.test(token));
    if (suffix) return suffix.startsWith('.') ? `${base}${suffix}` : `${base}.${suffix}`;
  }
  return base;
}

function extractDescription(page: PositionedPdfPage, rowY: number, nextRowY: number) {
  const totalY = page.items
    .filter(item => item.y > rowY && item.y < nextRowY && /^Total\s*\(/i.test(item.text.trim()))
    .map(item => item.y)
    .sort((left, right) => left - right)[0];
  const endY = totalY || nextRowY;
  // Collect every token between this item's data row and the next, then group them
  // into visual lines. Description text, the numeric data rows (rate/qty/amount),
  // and section headings each sit on their own y-line, so we can keep the
  // description lines and discard the rest — instead of blending them together
  // (which used to append stray column numbers and heading words like "ROOFING"
  // to the description and break keyword-based classification).
  const band = page.items.filter(item => item.y > rowY + 12 && item.y < endY - 2);
  const lines = new Map<number, PositionedPdfTextItem[]>();
  for (const item of band) {
    const y = Math.round(item.y / 2) * 2;
    lines.set(y, [...(lines.get(y) || []), item]);
  }
  const keptLines: string[] = [];
  for (const [, items] of Array.from(lines.entries()).sort(([left], [right]) => left - right)) {
    const ordered = items.sort((left, right) => normalizedX(page, left) - normalizedX(page, right));
    const tokens = ordered.map(item => item.text.trim()).filter(Boolean);
    if (!tokens.length) continue;
    const fullLine = tokens.join(' ');
    // Drop section headings and running page headers/footers.
    if (/Chapter Name|Group Name|Sub Head|Schedule\b|Now to pay|Page\s+\d+/i.test(fullLine)) continue;
    // Drop numeric data rows: rates, quantities and amounts sit on their own line,
    // so a line that is mostly standalone numbers is not description text.
    const numericTokens = tokens.filter(token => NUMBER_PATTERN.test(token));
    if (numericTokens.length >= Math.max(2, Math.ceil(tokens.length * 0.6))) continue;
    // Keep only the description column (drop left-margin serial / item-code tokens).
    const descTokens = ordered
      .filter(item => {
        const x = normalizedX(page, item);
        return x >= X.unit[0] && x < 790;
      })
      .map(item => item.text.trim())
      .filter(Boolean);
    if (descTokens.length) keptLines.push(descTokens.join(' '));
  }
  return keptLines
    .join(' ')
    .replace(/&amp;/g, '&')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/\s+/g, ' ')
    // Strip trailing bare numbers: an amount/quantity from the right-hand columns can
    // land at the end of the final wrapped description line (e.g. "...330 kg /cum 156852.1").
    // Work descriptions never end in a standalone number, so this is safe.
    .replace(/(?:\s+-?\d[\d,]*(?:\.\d+)?\.?)+\s*$/, '')
    .trim()
    .slice(0, 500);
}

type SteelCategory = 'TMT' | 'ANGLE_CHANNEL' | 'PLATES' | 'OTHER_SECTIONS';

/**
 * Which of Clause 46A.9(1)'s four steel categories an item draws on.
 *
 * Returns every one that applies. An item names its sections outright — "angles, tees
 * and channels", "plates" — or it names none and describes the work instead:
 * "Structural steel work riveted, bolted or welded in built up sections, trusses and
 * framed work" (DSR 10.2) is built from angles, channels and plates, and saying so
 * beats filing the whole amount under Other Sections because no section was spelled
 * out. Where an item genuinely is one category, it still returns just that one.
 */
function steelCategoriesFor(text: string): SteelCategory[] {
  const found = new Set<SteelCategory>();
  if (/\b(?:tmt|reinforcement|thermo-?\s*mechanically treated|fe-?500|fe-?550)\b/.test(text)) found.add('TMT');
  if (/\b(?:angles?|channels?|joists?|\bISA\b|\bISMC\b|\bISMB\b)\b/i.test(text)) found.add('ANGLE_CHANNEL');
  if (/\bplates?\b|\bchequered\b|\bgussets?\b/.test(text)) found.add('PLATES');
  if (/\b(?:flats?|rounds?|squares?|tees?|wire rope|rails?)\b/.test(text)) found.add('OTHER_SECTIONS');

  // Structural work that names no section is made of all three structural categories.
  // There is no "structural" category in 46A.9(1) to put it in, and Other Sections is
  // the residue, not the default.
  const structural = /\bstructural steel\b|\bbuilt[\s-]*up section/.test(text)
    || /\btruss(?:es)?\b|\bframed work\b|\bgirders?\b|\bgantry\b|\bstanchions?\b/.test(text);
  if (structural && !found.has('ANGLE_CHANNEL') && !found.has('PLATES')) {
    found.add('ANGLE_CHANNEL');
    found.add('PLATES');
    found.add('OTHER_SECTIONS');
  }

  // Steel with nothing to say which kind. Other Sections is where the schedule puts
  // what does not belong to the three named categories.
  if (found.size === 0 && /\bsteel\b|\bm\.?s\.?\b/.test(text)) found.add('OTHER_SECTIONS');

  // A fixed order, so the same item always reports its categories the same way.
  const order: SteelCategory[] = ['TMT', 'ANGLE_CHANNEL', 'PLATES', 'OTHER_SECTIONS'];
  return order.filter(category => found.has(category));
}

function materialFlags(description: string) {
  const text = description.toLowerCase();
  // Cement being supplied as its own item, rather than consumed by a work item.
  // The spelled-out grade names matter as much as the abbreviations: IREPS prints
  // "Pozzolana Portland Cement approved brands/makes" with no "PPC" anywhere, and
  // that was being read as a work item that merely uses cement.
  const directCement = /\b(?:supply|supplying)\b.{0,80}\bcement\b|ordinary portland cement|(?:portland pozzolana|pozzolana portland) cement|portland slag cement|\bopc\b|\bppc\b|\bpsc\b/.test(text);
  const isCementAffected = !directCement && /\b(?:cement|concrete|rcc|pcc|mortar|grout|shotcrete|1\s*:\s*\d)\b/.test(text);
  const steelTypes = steelCategoriesFor(text);
  let steelType: DeterministicBillItem['steelType'] = steelTypes[0] || '';
  // Recognising a steel type IS what makes this a steel item. The two used to be
  // decided separately, by keyword lists that disagreed, so a DSR sub-item came
  // out as TMT yet not steel: IREPS prints only the leaf variant on the row
  // ("Thermo-Mechanically Treated bars of grade Fe-500D or more"), while the word
  // "steel" sits in the parent heading above it. Downstream reads isSteelItem, so
  // reinforcement worth lakhs was never offered as a steel supply item.
  let isSteelItem = steelType !== '';

  // Material the Railway issues free, or at a fixed rate, is not the contractor's to be
  // compensated for — GCC-2022 Cl.46A.1(a) puts it outside price adjustment, and the
  // definition of W excludes "cost of materials supplied by Railway either free or at
  // fixed rate". Such an item is billed for the WORK alone, so its amount belongs in W,
  // but pricing it against the steel index would compensate the contractor for a
  // material they never bought.
  //
  // Item 013070 of SER/KGP/Civil/2024/0066 is the case: "Driving rails 90R/52 Kg
  // section..." reads as steel on the word "rail", while the same description says
  // "...length of rail which will be supplied free by Railways at the site of work."
  const railwaySupplied =
    /\b(?:supplied|issued|provided)\s+(?:free\s+)?(?:of\s+cost\s+)?by\s+(?:the\s+)?railways?\b/.test(text)
    || /\bfree\s+(?:issue|supply)\b/.test(text)
    || /\bdepartmental(?:ly)?\s+suppl/.test(text);
  if (railwaySupplied) {
    isSteelItem = false;
    steelType = '';
    steelTypes.length = 0;
  }

  return { isSteelItem, isCementAffected, steelType, steelTypes: isSteelItem ? steelTypes : [], railwaySupplied };
}

// Reads the first positive rupee value on the Schedule Summary row whose label
// matches `labelPattern`, scanning from the last page (the summary sits near the
// end). Returns the matched label text too, so callers can pull the rebate % out
// of a "Rebate(30.01%)" label.
function extractSummaryRow(pages: PositionedPdfPage[], labelPattern: RegExp) {
  for (const page of [...pages].reverse()) {
    const labelLine = pageLines(page).find(line => labelPattern.test(line.text));
    if (!labelLine) continue;
    const value = page.items
      .filter(item => item.x > 250 && Math.abs(item.y - labelLine.y) <= 12 && NUMBER_PATTERN.test(item.text.trim()))
      .sort((left, right) => left.x - right.x)
      .map(item => numericValue(item.text.trim()))
      .find((candidate): candidate is number => candidate !== undefined && candidate > 0);
    if (value !== undefined) return { value, labelText: labelLine.text };
  }
  return undefined;
}

// The printed net "Bill Amount (Rs.) (Including Tax (GST))" — the amount actually payable.
function extractBillAmount(pages: PositionedPdfPage[]) {
  return extractSummaryRow(pages, /Bill Amount\s*\(Rs\.?\)/i)?.value;
}

// Pulls the gross "Total Amount(Rs.)", the "Rebate(xx.xx%)" percentage/amount, and
// the net "Bill Amount" from the Schedule Summary. When a work is awarded below the
// estimate, the gross total is reduced by the rebate to give the net Bill Amount.
function extractScheduleSummaryFinancials(pages: PositionedPdfPage[]) {
  const billAmount = extractBillAmount(pages);
  const totalRow = extractSummaryRow(pages, /Total Amount\s*\(Rs\.?\)/i);
  const rebateRow = extractSummaryRow(pages, /Rebate\s*\(/i);
  const rebatePercentage = rebateRow
    ? numericValue(rebateRow.labelText.match(/Rebate\s*\(\s*(-?[\d.]+)\s*%/i)?.[1] || '')
    : undefined;
  return {
    billAmount,
    totalAmount: totalRow?.value,
    rebatePercentage,
    rebateAmount: rebateRow?.value,
  };
}

const MONTHS: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
};

// Converts an IREPS-style date (DD-MM-YYYY, DD/MM/YYYY, DD-Mon-YYYY, YYYY-MM-DD) to ISO YYYY-MM-DD.
function toIsoDate(raw: string): string {
  const value = raw.trim();
  const iso = value.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const named = value.match(/(\d{1,2})[-/ ]([A-Za-z]{3,})[-/ ](\d{4})/);
  if (named) {
    const month = MONTHS[named[2].slice(0, 3).toLowerCase()];
    if (month) return `${named[3]}-${month}-${named[1].padStart(2, '0')}`;
  }
  const numeric = value.match(/(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (numeric) return `${numeric[3]}-${numeric[2].padStart(2, '0')}-${numeric[1].padStart(2, '0')}`;
  return '';
}

// A date token in any IREPS-supported format.
const DATE_TOKEN = String.raw`(\d{1,2}[-/]\d{1,2}[-/]\d{4}|\d{1,2}[-/ ][A-Za-z]{3,}[-/ ]\d{4}|\d{4}-\d{2}-\d{2})`;

// Finds the measurement/recording date near common IREPS bill labels. Runs on the
// fully-flattened page text (labels and values can be split across layout lines).
function extractMeasurementDate(flatText: string): string {
  const labels = [
    'Measurement Date From',
    'Date Of Measurement',
    'Measurement Date',
    'Measurement Recorded On',
    'Recorded Date',
    'Bill Date',
    'Passing Date',
    'M\\.?B\\.? Date',
  ];
  for (const label of labels) {
    // Allow a few filler words/chars between the label and the date token.
    const match = flatText.match(new RegExp(`${label}[^0-9]{0,15}${DATE_TOKEN}`, 'i'));
    const iso = toIsoDate(match?.[1] || '');
    if (iso) return iso;
  }
  return '';
}

// The bill header is a grid of label/value pairs, and a value that runs to several
// lines starts ABOVE its own label — "Name Of Contractor" prints alongside the third
// line of a four-line name. Reading forward from the label through flattened text
// therefore returns whatever happens to follow it: across the bills tested that was a
// tail fragment of the name ("CORPORATION-", "LIMITED-"), or a piece of the Name of
// Work entirely. Read the value column by position instead, taking every line of it.
function labelledValue(
  pages: PositionedPdfPage[],
  labelPattern: RegExp,
  lastWord: string,
  // How far right the value column runs. The header grid puts label columns at roughly
  // x 60 / 311 / 561, so a value in the last column is narrow while the Name of Work
  // spans almost the whole form and needs the room.
  columnWidth = 230,
): string {
  for (const page of pages.slice(0, 2)) {
    const line = pageLines(page).find(candidate => labelPattern.test(candidate.text));
    if (!line) continue;
    // Right-most occurrence of the label's final word on that line fixes the column.
    const anchor = page.items
      .filter(item => Math.abs(item.y - line.y) <= 2.5 && item.text.trim().toLowerCase() === lastWord.toLowerCase())
      .sort((left, right) => right.x - left.x)[0];
    if (!anchor) continue;
    const anchorX = normalizedX(page, anchor);
    // How far the row extends, taken from the labels above and below it in the same
    // label column rather than a fixed distance. The Name of Work cell on a composite
    // agreement runs to seven or eight wrapped lines, and a fixed window centred on the
    // label read only the middle of it: "(iii) Provision of CC apron and Complete Track
    // renewal ... (iv) Improvements to Roller Bearing" — losing "(i) Renewal of roof in
    // foundry shop" off the top and "(v) Provision of New Painting Shed ... (vi)
    // Conversion of Existing Class room ... Hostel building" off the bottom. The
    // classifier then read the work as track and crane rails with the building scope
    // missing entirely.
    const labelX = Math.min(...page.items
      .filter(item => Math.abs(item.y - line.y) <= 2.5)
      .map(item => normalizedX(page, item)));
    const labelYs = Array.from(new Set(page.items
      .filter(item => Math.abs(normalizedX(page, item) - labelX) <= 6 && item.text.trim())
      .map(item => item.y)));
    const above = labelYs.filter(y => y < line.y - 4).sort((a, b) => b - a)[0];
    const below = labelYs.filter(y => y > line.y + 4).sort((a, b) => a - b)[0];
    // Reach most of the way to the neighbouring label, not half way. Each label is
    // centred in its own cell, and this cell is far taller than the one above it, so
    // its first line sits above the midpoint between the two labels — stopping there
    // still lost it. A quarter of the gap is left as clearance so the neighbour's own
    // line is never picked up. Where there is no neighbour — the top and bottom of the
    // form — the old fixed window stands.
    const clearance = (gap: number) => Math.max(4, gap * 0.25);
    const top = above !== undefined ? above + clearance(line.y - above) : line.y - 22;
    const bottom = below !== undefined ? below - clearance(below - line.y) : line.y + 22;
    const value = page.items
      .filter(item => {
        const x = normalizedX(page, item);
        // Its own value column, and within its own row of the form.
        return x > anchorX + 20 && x < anchorX + columnWidth && item.y > top && item.y < bottom;
      })
      .sort((left, right) => left.y - right.y || normalizedX(page, left) - normalizedX(page, right))
      .map(item => item.text.trim())
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    // A Name of Work that lists six sub-works runs past 200 characters and was being
    // cut there, dropping the last scopes it names — which are the ones the classifier
    // needs. Long enough for the longest of these; still bounded so a misread column
    // cannot pull a whole page into a metadata field.
    if (value) return value.slice(0, 1200);
  }
  return '';
}

function metadata(pages: PositionedPdfPage[]) {
  const text = pages.slice(0, 2).map(pagePlainText).join('\n');
  const flatText = pages.slice(0, 2)
    .flatMap(page => page.items.map(item => item.text))
    .join(' ')
    .replace(/\s+/g, ' ');
  return {
    billNo: text.match(/Bill No\.\s*([^\r\n]+)/i)?.[1]?.trim() || '',
    agreementNo: flatText.match(/Agreement No\.\s*([^\s]+)/i)?.[1]?.trim() || '',
    contractorName: labelledValue(pages, /Name\s+Of\s+Contractor/i, 'Contractor')
      || text.match(/Name Of Contractor\s+(.+?)(?=\s+LOA|\n)/i)?.[1]?.trim() || '',
    // The Name of Work sits in the form's first column and runs almost its full width,
    // so it needs the wider window. Reading it forward from the label returned the
    // literal text "Name Of Contractor" — the next label on the line — on every bill
    // tested, and this text is what decides the GCC work group.
    workDescription: labelledValue(pages, /Name\s+Of\s+Work/i, 'Work', 460)
      || text.match(/Name Of Work\s+(.+?)(?=\s+Name Of Contractor|\n)/i)?.[1]?.trim() || '',
    measurementDate: extractMeasurementDate(flatText),
    // The bill header repeats the contract's own identity. A contractor who has the
    // running bill but not the signed agreement can therefore still get a contract
    // set up from an LOA (or from the bill alone), with these filling the blanks.
    agreementDate: headerDate(flatText, /Agreement Date/i),
    loaNo: flatText.match(/LOA No\.?\s*([A-Za-z0-9\/\-]+)/i)?.[1]?.trim() || '',
    loaDate: headerDate(flatText, /LOA Date/i),
    // Not printed on any IREPS running bill seen so far, but other formats carry it
    // and the contract value decides PVC eligibility (GCC 46A.1, ≥ Rs 2 Cr).
    agreementValue: headerAmount(flatText),
  };
}

/** A DD/MM/YYYY value printed after a header label, as an ISO date string. */
function headerDate(flatText: string, label: RegExp): string {
  const match = flatText.match(new RegExp(label.source + String.raw`\s*(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})`, 'i'));
  if (!match) return '';
  const [, dd, mm, yyyy] = match;
  const date = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
  if (isNaN(date.getTime()) || date.getMonth() !== Number(mm) - 1) return '';
  // Formatted by hand: toISOString() on a local-midnight date rolls back a day east
  // of Greenwich, which would report every agreement as signed the day before.
  return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
}

/** The accepted contract value, when the bill prints it under any of its usual names. */
function headerAmount(flatText: string): number | null {
  const match = flatText.match(
    /(?:Agreement|Contract|Accepted|Tender)\s+(?:Value|Amount)\s*(?:\(Rs\.?\)|Rs\.?|:)?\s*([\d,]+(?:\.\d+)?)/i,
  );
  if (!match) return null;
  const value = Number(match[1].replace(/,/g, ''));
  return Number.isFinite(value) && value > 0 ? value : null;
}

// Turns the skipped-row log into something a contractor can act on: which item
// numbers were left out, how much they were worth, and why. Without this the
// reconciliation failure only reports that money is missing, not where from.
function describeSkippedRows(skipped: Array<{ reason: string; itemNo: string; amount: number }>) {
  if (!skipped.length) {
    return 'No item rows were skipped, so a line item is likely printed in a layout the reader does not recognise. '
      + 'Please send this PDF to support so the reader can be taught it.';
  }
  const byReason = new Map<string, { count: number; amount: number; rows: string[] }>();
  for (const row of skipped) {
    const entry = byReason.get(row.reason) || { count: 0, amount: 0, rows: [] };
    entry.count += 1;
    entry.amount += row.amount;
    if (entry.rows.length < 6) entry.rows.push(`${row.itemNo || 'item ?'} (Rs ${row.amount.toFixed(2)})`);
    byReason.set(row.reason, entry);
  }
  const lines = Array.from(byReason, ([reason, entry]) =>
    `- ${entry.count} row(s) worth Rs ${entry.amount.toFixed(2)} — ${reason}: `
    + `${entry.rows.join(', ')}${entry.count > entry.rows.length ? ', …' : ''}`);
  return `Rows skipped while reading:\n${lines.join('\n')}`;
}

export async function parseIrepsBillPdfDirect(pdfBuffer: Buffer): Promise<DeterministicBillDetails> {
  const pages = await extractPositionedPdfPages(pdfBuffer);
  if (!pages.length || pages.reduce((sum, page) => sum + page.items.length, 0) < 20) {
    throw new Error(
      'This looks like a scanned copy — the pages are images with no readable text, so the amounts cannot be extracted. '
      + 'Please upload the digitally-generated IREPS PDF (downloaded from IREPS) instead of a scanned or photographed copy.',
    );
  }

  const items: DeterministicBillItem[] = [];
  // Rows the reader saw but did not take. Tracked so a failed reconciliation can
  // say WHICH money went missing instead of only that some did.
  const skippedRows: Array<{ reason: string; itemNo: string; amount: number }> = [];
  // Money on rows that measured nothing this period but are still payable — a rate
  // revision applied to work measured earlier. Tracked only to report it.
  let rateRevisionAmount = 0;
  // Rows the bill measured but held over for a later payment; its own Total excludes them.
  let heldOverAmount = 0;
  let currentSchedule = 'Schedule UNASSIGNED';
  let currentScheduleHeading = '';
  let currentChapter = '';
  let currentGroupName = '';

  for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
    const page = pages[pageIndex];
    const nextPage = pages[pageIndex + 1];
    const nextPageTop = pageTopItems(nextPage);
    const lines = pageLines(page);
    // A schedule heading is printed as a band wrapping over three or four lines, and
    // its tail is where a B schedule names its sub-work — "...for Tiruchirappalli
    // Division. DTTC hostel/Diesel shed/Ponmalai." Keeping only the first line cut the
    // tail off mid-word. The lines after a schedule line are appended until one reads
    // as a marker or as table matter. Idempotent under the parser's replaying of lines:
    // each pass replays from the top of the page, so the heading is rebuilt the same
    // way every time rather than growing.
    let headingContinue = 0;
    const updateContext = (lineText: string) => {
      const scheduleMatch = lineText.match(/Schedule\s+([A-Z]\d*[A-Za-z]?)\b/i);
      if (scheduleMatch) {
        currentSchedule = `Schedule ${scheduleMatch[1]}`;
        currentScheduleHeading = lineText;
        headingContinue = 3;
        return;
      }
      const chapterMatch = lineText.match(/Chapter Name:-\s*(.+)/i);
      if (chapterMatch) currentChapter = chapterMatch[1].trim();
      const groupNameMatch = lineText.match(/Group Name:-\s*(.+)/i);
      if (groupNameMatch) currentGroupName = groupNameMatch[1].trim();
      if (chapterMatch || groupNameMatch) {
        headingContinue = 0;
        return;
      }
      if (headingContinue > 0) {
        const tableish = /Sr\.|Item\s*No|Account of work|Payment on the basis|Amount\s+(?:up\s*to|Since)|Base\s*Rate|^Total\b/i.test(lineText)
          || (lineText.match(/\d+\.\d/g) || []).length >= 2
          || !/[A-Za-z]{3}/.test(lineText);
        if (tableish) {
          headingContinue = 0;
        } else {
          currentScheduleHeading += ` ${lineText}`;
          headingContinue -= 1;
        }
      }
    };
    const units = page.items
      .filter(item => {
        const x = normalizedX(page, item);
        if (!(x >= X.unit[0] && x < X.unit[1])) return false;
        if (UNIT_PATTERN.test(item.text.trim())) return true;
        // Wrapped: the halves join into the unit the row is really billed in.
        return UNIT_PATTERN.test(cellText(page, page.items, X.unit, item.y));
      })
      .sort((left, right) => left.y - right.y);
    const candidates = units.filter(unitItem => {
      const agreementRaw = cellText(page, page.items, X.agreementRate, unitItem.y);
      const quantityRaw = cellText(page, page.items, X.qtySinceLast, unitItem.y);
      const specialRaw = cellText(page, page.items, X.specialAmount, unitItem.y);
      const amountRaw = cellText(page, page.items, X.amountSinceLast, unitItem.y);
      return (numericValue(agreementRaw) || 0) > 0
        && numericValue(quantityRaw) !== undefined
        // Bills with no special condition leave that column blank, so also accept
        // a readable plain "Amt since last Bill". Requiring the special column
        // used to drop those rows before they were ever considered.
        && (numericValue(specialRaw) !== undefined || numericValue(amountRaw) !== undefined);
    });

    // A two-word unit prints on two lines ("HP" above "Hour"), and if both words were
    // ever unit-like the same physical row would be anchored twice and its amount
    // counted twice. Two anchors reading identical rate, quantity and amount cells
    // within a row's height are the same row, so keep only the first.
    const deduped = candidates.filter((unitItem, index) => {
      const previous = candidates[index - 1];
      if (!previous || unitItem.y - previous.y > 20) return true;
      const signature = (y: number) => ([X.agreementRate, X.qtySinceLast, X.amountSinceLast, X.specialAmount] as const)
        .map(range => cellText(page, page.items, range, y)).join('|');
      return signature(unitItem.y) !== signature(previous.y);
    });

    for (let index = 0; index < deduped.length; index += 1) {
      const unitItem = deduped[index];
      for (const line of lines.filter(line => line.y < unitItem.y)) {
        updateContext(line.text);
      }

      // A figure ending in a decimal point is proof this row was cut in half by a
      // page break — no complete number ends that way. When it happens, every one of
      // the row's columns continues on the next page's first line, so each is
      // rejoined with the digits printed there. Nothing is read across pages unless
      // that proof is present, so an ordinary page header can never be mistaken for
      // a continuation. (SR/MDU/Civil/2024/0037/B7 splits "1705841." | "95" this way.)
      const straddlesPageBreak = ([X.agreementRate, X.qtySinceLast, X.amountSinceLast, X.specialAmount] as const)
        .some(range => cellText(page, page.items, range, unitItem.y).endsWith('.'));
      const readCell = (range: readonly [number, number]) => {
        const base = cellText(page, page.items, range, unitItem.y);
        if (!base || !straddlesPageBreak) return base;
        return `${base}${continuationDigits(nextPage, nextPageTop, range)}`;
      };

      const agreementRateRaw = readCell(X.agreementRate);
      const quantityRaw = readCell(X.qtySinceLast);
      const agreementAmountRaw = readCell(X.amountSinceLast);
      const specialAmountRaw = readCell(X.specialAmount);
      const agreementRate = numericValue(agreementRateRaw) || 0;
      const quantity = numericValue(quantityRaw) || 0;
      const agreementAmount = numericValue(agreementAmountRaw) || 0;
      const specialAmount = numericValue(specialAmountRaw) || 0;
      // What this row actually adds to the bill: the special-condition amount whenever
      // that column is printed for the row — including when it is printed as 0.00, which
      // is the bill saying this row pays nothing. Only a BLANK cell means the bill has
      // no such column, and only then does the plain amount at agreement rate stand in.
      // Either can be negative — a bill reverses an earlier over-measurement by billing
      // a minus quantity, and that row reduces the bill like any other.
      const specialPrinted = numericValue(specialAmountRaw) !== undefined;
      const payableAmount = specialPrinted ? specialAmount : agreementAmount;
      const nextRowY = deduped[index + 1]?.y || page.height - 5;
      const rowMayContinue = straddlesPageBreak || index === deduped.length - 1;
      const itemNo = extractItemCode(page, unitItem.y, nextRowY, rowMayContinue && nextPage
        ? nextPageTop
            .filter(topItem => {
              const x = normalizedX(nextPage, topItem);
              return x >= X.item[0] && x < X.item[1];
            })
            .map(topItem => topItem.text.trim())
        : []);

      // IREPS prints a payment status in the right-most column: "Now to pay 100%",
      // "As per special Condition", or "Pay Later". A "Pay Later" row is measured but
      // held over — it carries an amount in the since-last column while its own
      // "Total upto date" stays zero, and the bill's printed Total excludes it. Reading
      // it as payable inflated B-8 of SR/TPJ/Civil/2025/0067 by Rs 2,82,823.75 across
      // 58 rows.
      const paymentStatus = page.items
        .filter(statusItem => normalizedX(page, statusItem) > 700 && Math.abs(statusItem.y - unitItem.y) <= 6)
        .map(statusItem => statusItem.text.trim())
        .join(' ');
      if (/pay\s*later/i.test(paymentStatus)) {
        heldOverAmount += payableAmount;
        continue;
      }

      // Nothing measured this period. Silent: most rows of a long bill are idle,
      // and listing them would bury the rows that actually failed to read.
      //
      // But a row with no fresh quantity can still be payable: a special-condition
      // amount against previously measured work is a rate revision, and the bill's
      // own Total counts it. SR/TPJ/Civil/2025/0067/B7 pays Rs 2,30,850 that way over
      // two rows. Dropping them left that money unclassified — so it drew no price
      // variation at all, and the statement's item total fell short of the bill.
      // A stray figure in the PLAIN amount column is a different thing and stays out:
      // B-8 of SER/KGP/Civil/2024/0066 reads Re 1 against a zero quantity, and the
      // bill's own Total leaves it out.
      if (quantity === 0) {
        if (specialAmount === 0) continue;
        rateRevisionAmount += specialAmount;
      }
      if (payableAmount === 0 && (specialPrinted || numericValue(agreementAmountRaw) !== undefined)) {
        // The bill printed an amount and it is zero: nothing measured, nothing to read.
        continue;
      }
      if (!(agreementRate > 0 && payableAmount !== 0)) {
        skippedRows.push({ reason: 'no payable amount could be read', itemNo, amount: 0 });
        continue;
      }
      // Verify the row by re-doing its arithmetic: Qty x Rate must reproduce the
      // printed amount. IREPS prints rounded quantities, so the product can differ
      // by rupees on large items - hence 0.1% (min Re 1) rather than paise. The
      // whole-bill reconciliation below is the real guard: a misread column cannot
      // survive it, so this check does not need to be tighter than the print.
      if (agreementAmount !== 0 && quantity !== 0) {
        const arithmeticDifference = Math.abs(quantity * agreementRate - agreementAmount);
        // Rate x the quantity's own printed rounding is the error the print can carry;
        // 0.1% of the amount covers large items, and Re 1 is the floor for small ones.
        const printTolerance = Math.max(1, Math.abs(agreementAmount) * 0.001, Math.abs(agreementRate) * 0.01);
        if (arithmeticDifference > printTolerance) {
          skippedRows.push({
            reason: `Qty x Rate did not reproduce the printed amount (off by Rs ${arithmeticDifference.toFixed(2)})`,
            itemNo,
            amount: payableAmount,
          });
          continue;
        }
      }

      const description = extractDescription(page, unitItem.y, nextRowY) || `IREPS item ${itemNo || items.length + 1}`;
      // Detect the source book from the schedule heading. CPWD headings vary
      // ("CPWD SOR DSR Vol-I & II(2021)", "CPWD-DSR 2021", "DSR Vol-I"), so match
      // CPWD/DSR loosely rather than requiring an exact "CPWD-DSR" token.
      const sourceBook = /USSR|UNIFIED STANDARD/i.test(currentScheduleHeading)
        ? 'USSR_2021'
        : /CPWD.*DSR|DSR.*(?:2021|Vol)|CPWD\s*SOR|\bDSR\b/i.test(currentScheduleHeading)
          ? 'DSR_2021'
          : /NOT COVERED/i.test(currentScheduleHeading)
            ? 'NON_SCHEDULE'
            : 'UNKNOWN';

      items.push({
        dsrCode: itemNo,
        itemNo,
        description,
        unit: unitItem.text.replace(/\./g, ''),
        quantitySinceLastBill: quantity,
        quantitySinceLastBillRaw: quantityRaw,
        agreementRate,
        agreementRateRaw,
        amountAtAgreementRateSinceLastBill: agreementAmount,
        amountIncludingSpecialConditionSinceLastBill: payableAmount,
        amountSinceLastBill: payableAmount,
        schedule: currentSchedule,
        scheduleGroup: currentSchedule,
        scheduleHeading: currentScheduleHeading,
        chapter: currentChapter,
        groupName: currentGroupName,
        sourceBook,
        pageNumber: page.pageNumber,
        ...materialFlags(description),
        confidence: itemNo ? 'high' : 'medium',
        reason: 'Direct PDF coordinates; Qty since last Bill x Agreement Rate verified against current amount.',
      });
    }
    for (const line of lines) updateContext(line.text);
  }
  const financials = extractScheduleSummaryFinancials(pages);
  const netBillAmount = financials.billAmount;
  if (!items.length) {
    throw new Error('No payable IREPS item rows were found in this PDF.');
  }
  if (netBillAmount === undefined) {
    throw new Error('The printed Bill Amount could not be read from this PDF.');
  }
  // The extracted item rows carry the GROSS "Amt including Special Condition"
  // values, so they reconcile against the gross "Total Amount(Rs.)". When a
  // rebate is present the net "Bill Amount" is lower — reconciling against it
  // (the old behaviour) made every rebate bill fail by exactly the rebate.
  const grossTotal = financials.totalAmount ?? netBillAmount;
  const itemAmountTotal = Math.round(items.reduce((sum, item) => sum + item.amountSinceLastBill, 0) * 100) / 100;
  const expectedAmount = Math.round(grossTotal * 100) / 100;
  const amountDifference = Math.round((itemAmountTotal - expectedAmount) * 100) / 100;
  // IREPS prints each row's amount rounded to two decimals, so the sum of the rows
  // can drift from the printed total by about a paisa per row. Allow for that, and
  // no more: a genuinely missing item row is worth thousands, nowhere near this.
  const roundingTolerance = 0.05 + items.length * 0.01;
  const amountsReconciled = Math.abs(amountDifference) <= roundingTolerance;
  if (!amountsReconciled) {
    // Which lines read as data rows and yet were never anchored, and what they carry.
    const unanchored = findUnanchoredRows(pages);
    const unanchoredValue = unanchored.reduce((sum, row) => sum + row.amount, 0);
    const unknownUnitNote = unanchored.length > 0
      ? `\n${unanchored.length} line(s) carry a rate and an amount but no unit the reader knows, so they were never read `
        + `(Rs ${unanchoredValue.toFixed(2)} in total): `
        + unanchored
            .slice(0, 8)
            .map(row => `p${row.page} "${row.unit || '(blank)'}" Rs ${row.amount.toFixed(2)}`)
            .join('; ')
        + '.'
      : '';
    throw new Error(
      `Direct PDF item total Rs ${itemAmountTotal.toFixed(2)} does not match Total Amount Rs ${grossTotal.toFixed(2)}` +
      `. ${amountDifference < 0 ? 'Short' : 'Over'} by Rs ${Math.abs(amountDifference).toFixed(2)} after reading ${items.length} row(s).\n` +
      describeSkippedRows(skippedRows) + unknownUnitNote,
    );
  }
  const scheduleTotals = new Map<string, number>();
  for (const item of items) scheduleTotals.set(item.schedule, (scheduleTotals.get(item.schedule) || 0) + item.amountSinceLastBill);
  const details = metadata(pages);
  const rebatePercentage = financials.rebatePercentage;
  const rebateAmount = financials.rebateAmount;
  const warnings: string[] = [];
  if (rateRevisionAmount > 0.05) {
    warnings.push(
      `Rs ${rateRevisionAmount.toFixed(2)} is paid on rows with no quantity this period — a revised rate on work `
      + `measured earlier. It is included and classified like any other amount.`,
    );
  }
  if (heldOverAmount > 0.05) {
    warnings.push(
      `Rs ${heldOverAmount.toFixed(2)} of measured work is marked "Pay Later" on this bill and has been left out, `
      + `as the bill's own Total Amount leaves it out too. It becomes payable in a later bill.`,
    );
  }
  if (rebateAmount && rebateAmount > 0) {
    warnings.push(
      `A rebate of Rs ${rebateAmount.toFixed(2)}${rebatePercentage ? ` (${rebatePercentage}%)` : ''} was applied: ` +
      `gross Rs ${grossTotal.toFixed(2)} → net Bill Amount Rs ${netBillAmount.toFixed(2)}. Component amounts are scaled to the net value.`,
    );
  }
  return {
    ...details,
    measurementDate: details.measurementDate || '',
    grossBillAmount: grossTotal,
    netBillAmount,
    rebatePercentage,
    rebateAmount,
    scheduleSummary: Array.from(scheduleTotals, ([schedule, amountIncludingSpecialCondition]) => ({
      schedule,
      amountIncludingSpecialCondition: Math.round(amountIncludingSpecialCondition * 100) / 100,
    })),
    scheduleSummaryTotal: grossTotal,
    itemAmountTotal,
    amountDifference,
    amountsReconciled,
    items,
    warnings,
  };
}
