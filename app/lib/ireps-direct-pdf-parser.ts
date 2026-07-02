import { extractPositionedPdfPages, PositionedPdfPage, PositionedPdfTextItem } from './pdf-layout-extract';
import type { DeterministicBillDetails, DeterministicBillItem } from './ireps-bill-parser';

const UNIT_PATTERN = /^(?:Cum|Cu\.?m\.?|Sqm|Sq\.?m\.?|Kg|MT|M\.?T\.?|Metre|Meter|Each|Num|Nos?\.?|RM|Km|Litre|Set|Job|LS)$/i;
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

function extractItemCode(page: PositionedPdfPage, rowY: number, nextRowY: number) {
  const itemTokens = page.items
    .filter(item => {
      const x = normalizedX(page, item);
      return x >= X.item[0] && x < X.item[1] && item.y >= rowY - 12 && item.y < nextRowY - 3;
    })
    .sort((left, right) => left.y - right.y)
    .map(item => item.text.replace(/[()IG\s-]/gi, '').trim())
    .filter(Boolean);
  const base = itemTokens.find(token => /^\d+(?:\.\d+)*\.?$/.test(token))?.replace(/\.$/, '') || '';
  if (/^\d{4}$/.test(base)) {
    const suffix = itemTokens.find(token => token !== base && /^\d{1,2}$/.test(token));
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
  const descriptionItems = page.items
    .filter(item => {
      const x = normalizedX(page, item);
      return item.y > rowY + 12 && item.y < endY - 2 && x >= X.unit[0] && x < 790;
    });
  const lines = new Map<number, PositionedPdfTextItem[]>();
  for (const item of descriptionItems) {
    if (/^(?:Now to pay|Page\s+\d+|Schedule\s+|Chapter Name|Group Name)/i.test(item.text.trim())) continue;
    const y = Math.round(item.y / 2) * 2;
    lines.set(y, [...(lines.get(y) || []), item]);
  }
  return Array.from(lines.entries())
    .sort(([left], [right]) => left - right)
    .map(([, items]) => items
      .sort((left, right) => normalizedX(page, left) - normalizedX(page, right))
      .map(item => item.text.trim())
      .join(' '))
    .join(' ')
    .replace(/&amp;/g, '&')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500);
}

function materialFlags(description: string) {
  const text = description.toLowerCase();
  const isSteelItem = /\b(?:steel|tmt|reinforcement|angle|channel|plate|wire rope|rail)\b/.test(text);
  const directCement = /\b(?:supply|supplying)\b.{0,80}\bcement\b|ordinary portland cement|\bopc\b|\bppc\b/.test(text);
  const isCementAffected = !directCement && /\b(?:cement|concrete|rcc|pcc|mortar|grout|shotcrete|1\s*:\s*\d)\b/.test(text);
  let steelType: DeterministicBillItem['steelType'] = '';
  if (/\b(?:tmt|reinforcement|thermo-mechanically treated|bars?)\b/.test(text)) steelType = 'TMT';
  else if (/\b(?:angle|channel|joist)\b/.test(text)) steelType = 'ANGLE_CHANNEL';
  else if (/\bplates?\b/.test(text)) steelType = 'PLATES';
  else if (isSteelItem) steelType = 'OTHER_SECTIONS';
  return { isSteelItem, isCementAffected, steelType };
}

function extractBillAmount(pages: PositionedPdfPage[]) {
  for (const page of [...pages].reverse()) {
    const labelLine = pageLines(page).find(line => /Bill Amount\s*\(Rs\.?\)/i.test(line.text));
    if (!labelLine) continue;
    const amount = page.items
      .filter(item => item.x > 250 && Math.abs(item.y - labelLine.y) <= 12 && NUMBER_PATTERN.test(item.text.trim()))
      .sort((left, right) => left.x - right.x)
      .map(item => numericValue(item.text.trim()))
      .find((value): value is number => value !== undefined && value > 0);
    if (amount !== undefined) return amount;
  }
  return undefined;
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

function metadata(pages: PositionedPdfPage[]) {
  const text = pages.slice(0, 2).map(pagePlainText).join('\n');
  const flatText = pages.slice(0, 2)
    .flatMap(page => page.items.map(item => item.text))
    .join(' ')
    .replace(/\s+/g, ' ');
  return {
    billNo: text.match(/Bill No\.\s*([^\r\n]+)/i)?.[1]?.trim() || '',
    agreementNo: flatText.match(/Agreement No\.\s*([^\s]+)/i)?.[1]?.trim() || '',
    contractorName: text.match(/Name Of Contractor\s+(.+?)(?=\s+LOA|\n)/i)?.[1]?.trim() || '',
    workDescription: text.match(/Name Of Work\s+(.+?)(?=\s+Name Of Contractor|\n)/i)?.[1]?.trim() || '',
    measurementDate: extractMeasurementDate(flatText),
  };
}

export async function parseIrepsBillPdfDirect(pdfBuffer: Buffer): Promise<DeterministicBillDetails> {
  const pages = await extractPositionedPdfPages(pdfBuffer);
  if (!pages.length || pages.reduce((sum, page) => sum + page.items.length, 0) < 20) {
    throw new Error('This PDF has no usable positioned text. Scanned bills require OCR or manual entry.');
  }

  const items: DeterministicBillItem[] = [];
  let excludedZeroQtyAmount = 0;
  let currentSchedule = 'Schedule UNASSIGNED';
  let currentScheduleHeading = '';
  let currentChapter = '';
  let currentGroupName = '';

  for (const page of pages) {
    const lines = pageLines(page);
    const updateContext = (lineText: string) => {
      const scheduleMatch = lineText.match(/Schedule\s+([A-Z]\d*[A-Za-z]?)\b/i);
      if (scheduleMatch) {
        currentSchedule = `Schedule ${scheduleMatch[1]}`;
        currentScheduleHeading = lineText;
      }
      const chapterMatch = lineText.match(/Chapter Name:-\s*(.+)/i);
      if (chapterMatch) currentChapter = chapterMatch[1].trim();
      const groupNameMatch = lineText.match(/Group Name:-\s*(.+)/i);
      if (groupNameMatch) currentGroupName = groupNameMatch[1].trim();
    };
    const units = page.items
      .filter(item => {
        const x = normalizedX(page, item);
        return x >= X.unit[0] && x < X.unit[1] && UNIT_PATTERN.test(item.text.trim());
      })
      .sort((left, right) => left.y - right.y);
    const candidates = units.filter(unitItem => {
      const agreementRaw = cellText(page, page.items, X.agreementRate, unitItem.y);
      const quantityRaw = cellText(page, page.items, X.qtySinceLast, unitItem.y);
      const specialRaw = cellText(page, page.items, X.specialAmount, unitItem.y);
      return (numericValue(agreementRaw) || 0) > 0
        && numericValue(quantityRaw) !== undefined
        && numericValue(specialRaw) !== undefined;
    });

    for (let index = 0; index < candidates.length; index += 1) {
      const unitItem = candidates[index];
      for (const line of lines.filter(line => line.y < unitItem.y)) {
        updateContext(line.text);
      }

      const agreementRateRaw = cellText(page, page.items, X.agreementRate, unitItem.y);
      const quantityRaw = cellText(page, page.items, X.qtySinceLast, unitItem.y);
      const agreementAmountRaw = cellText(page, page.items, X.amountSinceLast, unitItem.y);
      const specialAmountRaw = cellText(page, page.items, X.specialAmount, unitItem.y);
      const agreementRate = numericValue(agreementRateRaw) || 0;
      const quantity = numericValue(quantityRaw) || 0;
      const agreementAmount = numericValue(agreementAmountRaw) || 0;
      const specialAmount = numericValue(specialAmountRaw) || 0;
      if (!(agreementRate > 0 && specialAmount > 0)) continue;
      if (quantity === 0) {
        excludedZeroQtyAmount += specialAmount;
        continue;
      }
      const arithmeticDifference = Math.abs(quantity * agreementRate - agreementAmount);
      if (arithmeticDifference > Math.max(0.15, agreementAmount * 0.00002)) continue;

      const nextRowY = candidates[index + 1]?.y || page.height - 5;
      const itemNo = extractItemCode(page, unitItem.y, nextRowY);
      const description = extractDescription(page, unitItem.y, nextRowY) || `IREPS item ${itemNo || items.length + 1}`;
      const sourceBook = /USSR|UNIFIED STANDARD/i.test(currentScheduleHeading)
        ? 'USSR_2021'
        : /CPWD-?DSR|DSR\s*2021/i.test(currentScheduleHeading)
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
        amountIncludingSpecialConditionSinceLastBill: specialAmount,
        amountSinceLastBill: specialAmount,
        schedule: currentSchedule,
        scheduleGroup: currentSchedule,
        chapter: currentChapter,
        groupName: currentGroupName,
        sourceBook,
        ...materialFlags(description),
        confidence: itemNo ? 'high' : 'medium',
        reason: 'Direct PDF coordinates; Qty since last Bill x Agreement Rate verified against current amount.',
      });
    }
    for (const line of lines) updateContext(line.text);
  }

  const billAmount = extractBillAmount(pages);
  if (!items.length) {
    throw new Error('No payable IREPS item rows were found in this PDF.');
  }
  if (billAmount === undefined) {
    throw new Error('The printed Bill Amount could not be read from this PDF.');
  }
  const itemAmountTotal = Math.round(items.reduce((sum, item) => sum + item.amountSinceLastBill, 0) * 100) / 100;
  const expectedAmount = Math.round((billAmount - excludedZeroQtyAmount) * 100) / 100;
  const amountDifference = Math.round((itemAmountTotal - expectedAmount) * 100) / 100;
  const amountsReconciled = Math.abs(amountDifference) <= 0.05;
  if (!amountsReconciled) {
    throw new Error(
      `Direct PDF item total Rs ${itemAmountTotal.toFixed(2)} does not match Bill Amount Rs ${billAmount.toFixed(2)}` +
      (excludedZeroQtyAmount > 0 ? ` (minus Rs ${excludedZeroQtyAmount.toFixed(2)} from zero-quantity rows excluded).` : '.'),
    );
  }
  const scheduleTotals = new Map<string, number>();
  for (const item of items) scheduleTotals.set(item.schedule, (scheduleTotals.get(item.schedule) || 0) + item.amountSinceLastBill);
  const details = metadata(pages);
  const warnings = excludedZeroQtyAmount > 0.05
    ? [`Excluded Rs ${excludedZeroQtyAmount.toFixed(2)} of payable amount from rows where printed Qty since last Bill is zero.`]
    : [];
  return {
    ...details,
    measurementDate: details.measurementDate || '',
    grossBillAmount: billAmount,
    scheduleSummary: Array.from(scheduleTotals, ([schedule, amountIncludingSpecialCondition]) => ({
      schedule,
      amountIncludingSpecialCondition: Math.round(amountIncludingSpecialCondition * 100) / 100,
    })),
    scheduleSummaryTotal: billAmount,
    itemAmountTotal,
    amountDifference,
    amountsReconciled,
    items,
    warnings,
  };
}
