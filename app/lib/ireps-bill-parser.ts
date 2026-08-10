export interface DeterministicBillItem {
  dsrCode: string;
  itemNo: string;
  description: string;
  unit: string;
  quantitySinceLastBill: number;
  quantitySinceLastBillRaw: string;
  agreementRate: number;
  agreementRateRaw: string;
  amountAtAgreementRateSinceLastBill: number;
  amountIncludingSpecialConditionSinceLastBill: number;
  amountSinceLastBill: number;
  schedule: string;
  scheduleGroup: string;
  /** The schedule heading as the bill prints it in full. Its tail names the sub-work
   * for B schedules, which print no "Group Name" heading over their items. */
  scheduleHeading?: string;
  chapter: string;
  groupName: string;
  sourceBook: 'USSR_2021' | 'DSR_2021' | 'NON_SCHEDULE' | 'UNKNOWN';
  isCementAffected: boolean;
  isSteelItem: boolean;
  steelType: 'TMT' | 'ANGLE_CHANNEL' | 'PLATES' | 'OTHER_SECTIONS' | '';
  /**
   * Every JPC category the item draws on, not just the first one matched.
   *
   * Clause 46A.9(1) prices steel against four categories, and a single item routinely
   * uses several: "Structural steel work riveted, bolted or welded in built up
   * sections, trusses and framed work" is angles, channels and plates together. It
   * names none of them, so it fell past every specific rule to Other Sections — the
   * catch-all — and was priced against that index alone.
   */
  steelTypes?: Array<'TMT' | 'ANGLE_CHANNEL' | 'PLATES' | 'OTHER_SECTIONS'>;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
  /**
   * Which page of the bill PDF this row was read from, 1-based.
   *
   * A classification is checked by finding the row on the bill and reading it, and on a
   * 27-page bill that means hunting. The reader knows the page; carrying it costs
   * nothing and turns the check into a glance.
   */
  pageNumber?: number;
}

export interface DeterministicBillDetails {
  billNo: string;
  agreementNo: string;
  /** The LOA number as the bill prints it — the second witness that a contract still
   * stands on its LOA number when its own loaNo field was never filled. */
  loaNo?: string;
  contractorName: string;
  workDescription: string;
  measurementDate: string;
  grossBillAmount?: number;
  netBillAmount?: number;
  /** Rebate percentage from the Schedule Summary "Rebate(xx.xx%)" row, if present. */
  rebatePercentage?: number;
  /** Rebate rupee amount deducted from the gross total, if present. */
  rebateAmount?: number;
  scheduleSummary: Array<{ schedule: string; amountIncludingSpecialCondition: number }>;
  scheduleSummaryTotal?: number;
  itemAmountTotal: number;
  amountDifference?: number;
  amountsReconciled: boolean;
  items: DeterministicBillItem[];
  warnings: string[];
}

interface NumericRow {
  start: number;
  end: number;
  prefix: string;
  unit: string;
  values: string[];
  raw: string;
  specialAmountRawHint?: string;
  previousCodeHint?: string;
  codeSuffixHint?: string;
}

const UNIT_PATTERN = 'cum|cu\.?m\.?|sqm|sq\.?m\.?|kg|mt|m\.?t\.?|metre|meter|each|trm|numbers?|nos?\.?|day|hour|litre|liter|km|rm|qtl|quintal|set|job|ls';
const NUMBER_PATTERN = /-?\d[\d,]*(?:\.\d*)?/g;

function toNumber(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value.replace(/,/g, '').replace(/\s+/g, ''));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function appendDecimalFragment(value: string, fragment: string): string {
  return value.includes('.') ? `${value}${fragment}` : `${value}.${fragment}`;
}

function repairInlineNumericFragments(values: string[]): string[] {
  const repaired: string[] = [];
  for (let index = 0; index < values.length; index += 1) {
    const current = values[index];
    const next = values[index + 1];
    if (/^\d{3,}\.\d$/.test(current) && /^\d$/.test(next || '')) {
      repaired.push(`${current}${next}`);
      index += 1;
    } else {
      repaired.push(current);
    }
  }
  return repaired;
}

function isoDate(value: string | undefined): string {
  const match = value?.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  return match ? `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}` : '';
}

function tableCells(line: string): string[] {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(cell => cell.trim());
}

function isSeparatorRow(line: string): boolean {
  return /^\|?[\s|:-]+\|?$/.test(line.trim()) && line.includes('---');
}

function combineCellFragments(fragments: string[]): string {
  const values = fragments.map(value => value.trim()).filter(Boolean);
  if (!values.length) return '';
  if (values.every(value => /^[\d.,\s-]+$/.test(value))) {
    return values.map(value => value.replace(/\s+/g, '')).join('');
  }
  return values.join(' ').replace(/\s+/g, ' ').trim();
}

export function normalizeIrepsMarkdownTables(markdown: string): string {
  const lines = markdown.split(/\r?\n/);
  const output: string[] = [];
  for (let index = 0; index < lines.length;) {
    if (!lines[index].trim().startsWith('|')) {
      output.push(lines[index]);
      index += 1;
      continue;
    }

    const block: string[] = [];
    while (index < lines.length && lines[index].trim().startsWith('|')) {
      if (!isSeparatorRow(lines[index])) block.push(lines[index]);
      index += 1;
    }
    if (!block.length) continue;
    const rows = block.map(tableCells);
    const width = Math.max(...rows.map(row => row.length));
    const cells = Array.from({ length: width }, (_, column) => (
      combineCellFragments(rows.map(row => row[column] || ''))
    ));
    output.push(cells.join(' | '));
  }
  return output.join('\n');
}

function extractRows(text: string): NumericRow[] {
  const rows: NumericRow[] = [];
  const lines = text.split(/\r?\n/);
  let offset = 0;
  const unitRegex = new RegExp(`\\b(${UNIT_PATTERN})\\b`, 'ig');
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    const unitMatches = Array.from(line.matchAll(unitRegex));
    const unitMatch = unitMatches.find(match => (
      /^[\s|]*-?\d/.test(line.slice((match.index || 0) + match[0].length))
    )) || unitMatches[0];
    if (unitMatch) {
      let prefix = line.slice(0, unitMatch.index).replace(/\|/g, ' ').trim();
      const suffix = line
        .slice(unitMatch.index + unitMatch[0].length)
        .replace(/Now to pay.*$/i, '')
        .replace(/As Per Special Condition.*$/i, '');
      let values = repairInlineNumericFragments(
        (suffix.match(NUMBER_PATTERN) || []).map(value => value.replace(/\s+/g, '')),
      );
      const upper = lineIndex > 0
        ? (lines[lineIndex - 1].match(NUMBER_PATTERN) || []).map(value => value.replace(/\s+/g, ''))
        : [];
      let specialAmountRawHint: string | undefined;
      let codeSuffixHint: string | undefined;
      if (/^[\s\d.,-]+$/.test(lines[lineIndex - 1] || '') && upper.length >= 2 && upper.length <= 4) {
        const fragments = values
          .slice(2)
          .filter(value => /^\d{1,2}$/.test(value))
          .slice(-upper.length);
        if (fragments.length === upper.length) {
          const reconstructed = upper.map((value, upperIndex) => appendDecimalFragment(value, fragments[upperIndex]));
          specialAmountRawHint = reconstructed[reconstructed.length - 2];
        }
      }
      if (line.includes('|') && upper.length >= 10 && /^\d{4,6}$/.test(upper[0].replace(/\D/g, '')) && values.length >= 6) {
        codeSuffixHint = prefix.match(/(?:^|[ \t])(\d{1,2})[ \t]*\([IG]\)/i)?.[1];
        const baseRateValues = values.slice(0, 2);
        const decimalFragments = values
          .slice(2)
          .filter(value => /^\d{1,2}$/.test(value))
          .slice(-4);
        const amountBases = upper.slice(-4);
        if (baseRateValues.length === 2 && decimalFragments.length === 4 && amountBases.length === 4) {
          const amounts = amountBases.map((value, amountIndex) => appendDecimalFragment(value, decimalFragments[amountIndex]));
          const rate = toNumber(baseRateValues[1]);
          const currentAmount = toNumber(amounts[1]);
          if (rate && currentAmount) {
            const derivedQuantity = (currentAmount / rate).toFixed(6).replace(/\.?0+$/, '');
            values = [
              ...baseRateValues,
              '0', '0', '0', derivedQuantity, derivedQuantity,
              ...amounts,
            ];
            prefix = upper[0];
          }
        }
      }
      if (values.length < 4 && lineIndex > 0 && lineIndex + 1 < lines.length) {
        const lower = (lines[lineIndex + 1].match(NUMBER_PATTERN) || []).map(value => value.replace(/\s+/g, ''));
        if (upper.length >= 5 && upper.length === lower.length) {
          const reconstructed = upper.map((value, index) => (
            value.endsWith('.') ? `${value}${lower[index]}` : value
          ));
          values = [...values, ...reconstructed];
        }
      }
      if (values.length >= 4) {
        const previousCodeCandidate = lines[lineIndex - 1]?.match(/^\s*(\d{4})(?=\s|\|)/)?.[1];
        const previousCodeHint = previousCodeCandidate === '2021' ? undefined : previousCodeCandidate;
        rows.push({
          start: offset,
          end: offset + line.length,
          prefix,
          unit: unitMatch[0].replace(/\./g, ''),
          values,
          raw: line,
          specialAmountRawHint,
          previousCodeHint,
          codeSuffixHint,
        });
      }
    }
    offset += line.length + 1;
  }
  return rows;
}

function latestContext(text: string, offset: number, pattern: RegExp): string {
  const source = text.slice(0, offset);
  let value = '';
  for (const match of source.matchAll(pattern)) value = String(match[1] || '').trim();
  return value;
}

function cleanDescription(value: string): string {
  return value
    .replace(/\|/g, ' ')
    .replace(/^\s*[-\d.,\s]+\s*$/gm, ' ')
    .replace(/^\s*-?\s*\d+(?:\.\d+)+\.?\s*$/gm, ' ')
    .replace(/^\s*-?\s*(?:[A-Z]\.)?(?:\d+(?:\.\d+)*|\.\d+)?\s*\([IG]\)\s*/gim, ' ')
    .replace(/^\s*-?\s*\d+(?:\.\d+)+\.?\s+(?=-|\([IG]\))/gim, ' ')
    .replace(/^\s*-?\s*\d+(?:\.\d+)+\.?\s+(?=[A-Za-z])/gim, ' ')
    .replace(/^\s*-\s*\d{1,3}\s+/gm, ' ')
    .replace(/^\s*\d{4}\s+(?=[A-Za-z])/gm, ' ')
    .replace(/^\s*-\s*\d{1,3}\s*$/gm, ' ')
    .replace(/^\s*\d+\s+00\s+\([IG]\)\s*/gim, ' ')
    .replace(/^\s*\([IG]\)\s*/gim, ' ')
    .replace(/^Page\s+\d+\s+of\s+\d+\s*$/gim, ' ')
    .replace(/^(?:Schedule|Group Name|Chapter Name|Total \().*$/gim, ' ')
    .replace(/Now to pay\s+\d+%/gi, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&apos;/g, "'")
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[-.\s]+/, '')
    .slice(0, 500);
}

function itemCode(row: NumericRow, followingText: string): string {
  const embeddedPrefixCode = row.prefix.match(/\([IG]\)[ \t]+(\d{4}|\d+(?:\.\d+)+)/i)?.[1] || '';
  const trailingPrefixCode = row.prefix.match(/(\d{1,6}(?:\.\d+)*)\.?\s*$/)?.[1] || '';
  const prefixCode = embeddedPrefixCode || trailingPrefixCode || row.previousCodeHint || '';
  const nearbyText = followingText.slice(0, 160).replace(/\|/g, ' ');
  const ussrFollowingText = followingText.slice(0, 2500).replace(/\|/g, ' ');
  const followingCode = nearbyText.match(/^\s*-?\s*(\d+(?:\.\d+)+)\.?(?:\s*$|\s+(?=-|\([IG]\)))/m)?.[1] || '';
  const followingUssrCandidate = ussrFollowingText.match(/^[ \t]*(\d{4})(?:[ \t]*$|[ \t]+(?=[A-Za-z]))/m)?.[1] || '';
  const followingUssrBase = followingUssrCandidate === '2021' ? '' : followingUssrCandidate;
  const baseCode = prefixCode || followingCode || followingUssrBase;
  const embeddedPrefixSuffix = row.prefix.match(/(?:^|[ \t])(\.?(?:\d+|[A-Z])(?:\.\d+)*)[ \t]*\([IG]\)/i)?.[1] || '';
  const suffix = row.codeSuffixHint
    || embeddedPrefixSuffix
    || nearbyText.match(/^[ \t]*-?[ \t]*(\.?(?:\d+|[A-Z])(?:\.\d+)*)[ \t]*\([IG]\)/im)?.[1]
    || '';
  const detachedUssrSuffix = /^\d{4}$/.test(baseCode)
    ? ussrFollowingText.match(/^[ \t]*-[ \t]*(\d{1,2})(?:[ \t]*$|[ \t]+\S)/m)?.[1] || ''
    : '';
  if (/^\d{4}$/.test(baseCode) && detachedUssrSuffix) {
    return `${baseCode}${detachedUssrSuffix.padStart(2, '0')}`;
  }
  if (baseCode && suffix) {
    const normalizedSuffix = suffix.replace(/^\./, '');
    if (/^\d{4}$/.test(baseCode) && /^\d{1,2}$/.test(normalizedSuffix)) {
      return `${baseCode}${normalizedSuffix.padStart(2, '0')}`;
    }
    const baseParts = baseCode.split('.');
    const suffixParts = normalizedSuffix.split('.');
    if (baseParts.slice(-suffixParts.length).join('.') !== normalizedSuffix) {
      return `${baseCode}.${normalizedSuffix}`;
    }
  }
  if (baseCode) return baseCode;
  const inlineFollowingCode = nearbyText.match(/^\s*-?\s*(\d+(?:\.\d+)+)\.?\s+\S/m)?.[1];
  if (inlineFollowingCode) return inlineFollowingCode;
  const nonschedule = followingText.match(/\b(\d+)\s+00\s+\([IG]\)/i)?.[1];
  return nonschedule ? `${nonschedule}00` : '';
}

function classifyMaterials(description: string) {
  const lower = description.toLowerCase();
  const isSteelItem = /\b(?:steel|tmt|reinforcement|angle|channel|plate|wire rope|rail)\b/.test(lower);
  let steelType: DeterministicBillItem['steelType'] = '';
  if (/\b(?:tmt|reinforcement|thermo-mechanically treated|bars?)\b/.test(lower)) steelType = 'TMT';
  else if (/\b(?:angle|channel|joist)\b/.test(lower)) steelType = 'ANGLE_CHANNEL';
  else if (/\bplates?\b/.test(lower)) steelType = 'PLATES';
  else if (isSteelItem) steelType = 'OTHER_SECTIONS';
  const isDirectCement = /\b(?:supply|supplying)\b.{0,80}\bcement\b|ordinary portland cement|\bopc\b|\bppc\b/.test(lower);
  const isCementAffected = !isDirectCement && /\b(?:cement|concrete|rcc|pcc|mortar|grout|shotcrete|1\s*:\s*\d)\b/.test(lower);
  return { isSteelItem, steelType, isCementAffected };
}

function parseItemScheduleSummaries(items: DeterministicBillItem[]) {
  const totals = new Map<string, number>();
  for (const item of items) totals.set(item.schedule, (totals.get(item.schedule) || 0) + item.amountSinceLastBill);
  return Array.from(totals, ([schedule, amountIncludingSpecialCondition]) => ({
    schedule,
    amountIncludingSpecialCondition: Math.round(amountIncludingSpecialCondition * 100) / 100,
  }));
}

function parsePrintedScheduleSummaries(markdown: string) {
  const summaryStart = markdown.search(/Schedule Summary\s*:/i);
  if (summaryStart < 0) return [];
  const summaryText = markdown.slice(summaryStart);
  const starts = Array.from(summaryText.matchAll(/^Schedule\s+([A-Z]\d*)\b/gim));
  return starts.flatMap((match, index) => {
    const code = match[1].toUpperCase();
    const blockStart = match.index || 0;
    const blockEnd = starts[index + 1]?.index ?? summaryText.search(/^Total Amount/im);
    const block = summaryText.slice(blockStart, blockEnd > blockStart ? blockEnd : summaryText.length);
    const costRow = block.split(/\r?\n/).find(line => {
      const values = (line.match(NUMBER_PATTERN) || [])
        .map(value => toNumber(value))
        .filter((value): value is number => value !== undefined && value !== 2021);
      return values.length >= 3;
    });
    if (!costRow) return [];
    const totals = (costRow.match(NUMBER_PATTERN) || [])
      .map(value => toNumber(value))
      .filter((value): value is number => value !== undefined && value !== 2021)
      .slice(-3);
    return totals.length === 3
      ? [{ schedule: `Schedule ${code}`, amountIncludingSpecialCondition: totals[1] }]
      : [];
  });
}

export function parseIrepsBillMarkdown(markdown: string): DeterministicBillDetails {
  const normalized = normalizeIrepsMarkdownTables(markdown);
  const rows = extractRows(normalized);
  const items: DeterministicBillItem[] = [];
  const warnings: string[] = [];

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const values = row.values;
    const agreementRateRaw = values[1];
    const agreementRate = toNumber(agreementRateRaw);
    if (agreementRate === undefined || !(agreementRate > 0)) continue;

    const matches: Array<{
      quantityRaw: string;
      quantity: number;
      amountAtRaw: string;
      amountAt: number;
      amountIndex: number;
    }> = [];
    const matchedValues = new Set<string>();
    const firstQuantityIndex = values.length >= 10 ? 4 : 2;
    for (let quantityIndex = firstQuantityIndex; quantityIndex < values.length - 1; quantityIndex += 1) {
      const candidateQuantity = toNumber(values[quantityIndex]);
      if (candidateQuantity === undefined || !(candidateQuantity > 0)) continue;
      for (let candidateAmountIndex = quantityIndex + 1; candidateAmountIndex < values.length; candidateAmountIndex += 1) {
        const candidateAmount = toNumber(values[candidateAmountIndex]);
        if (candidateAmount === undefined || !(candidateAmount > 0)) continue;
        const difference = Math.abs((candidateQuantity * agreementRate) - candidateAmount);
        if (difference <= Math.max(0.1, Math.abs(candidateAmount) * 0.00001)) {
          const key = `${candidateQuantity}|${candidateAmount}`;
          if (!matchedValues.has(key)) {
            matches.push({
              quantityRaw: values[quantityIndex],
              quantity: candidateQuantity,
              amountAtRaw: values[candidateAmountIndex],
              amountAt: candidateAmount,
              amountIndex: candidateAmountIndex,
            });
            matchedValues.add(key);
          }
          break;
        }
      }
    }
    if (!matches.length) continue;
    // Typical IREPS rows prove three pairs: up-to-last, since-last, and
    // up-to-date. The current pair is the middle one. If up-to-date is split
    // away by PDF layout, only two pairs remain and current is the latter.
    const selectedMatch = matches.length >= 3 ? matches[1] : matches[matches.length - 1];
    const { quantityRaw, quantity, amountAtRaw, amountAt, amountIndex } = selectedMatch;
    let specialAmountRaw = row.specialAmountRawHint || values[amountIndex + 1] || amountAtRaw;
    if (!row.specialAmountRawHint) {
      const firstSpecial = toNumber(specialAmountRaw);
      const nextSpecialRaw = values[amountIndex + 2];
      const nextSpecial = toNumber(nextSpecialRaw);
      if (
        firstSpecial !== undefined
        && nextSpecial !== undefined
        && Math.floor(firstSpecial) === Math.floor(nextSpecial)
        && nextSpecialRaw.length > specialAmountRaw.length
      ) {
        specialAmountRaw = nextSpecialRaw;
      }
    }
    const specialAmount = toNumber(specialAmountRaw);
    if (specialAmount === undefined || !(specialAmount > 0)) continue;

    const nextStart = rows[index + 1]?.start ?? normalized.length;
    const following = normalized.slice(row.end, nextStart);
    const code = itemCode(row, following);
    const description = cleanDescription(following) || `IREPS item ${code || items.length + 1}`;
    const scheduleHeading = latestContext(normalized, row.start, /^Schedule\s+([^\n]+)/gim);
    const scheduleCode = scheduleHeading.match(/^([A-Z]\d*)\b/i)?.[1]?.toUpperCase() || 'UNASSIGNED';
    const schedule = `Schedule ${scheduleCode}`;
    const chapter = latestContext(normalized, row.start, /^Chapter Name:-\s*([^\n]+)/gim);
    const groupName = latestContext(normalized, row.start, /^Group Name:-\s*([^\n]+)/gim);
    const scheduleText = scheduleHeading.toUpperCase();
    const sourceBook = /USSR|UNIFIED STANDARD/.test(scheduleText)
      ? 'USSR_2021'
      : /CPWD-?DSR|DSR-?2021/.test(scheduleText)
        ? 'DSR_2021'
        : /NOT COVERED|NON.?SCHEDULE/.test(scheduleText)
          ? 'NON_SCHEDULE'
          : 'UNKNOWN';
    const materials = classifyMaterials(description);
    const duplicateKey = `${schedule}|${code}|${quantityRaw}|${specialAmountRaw}`;
    if (items.some(item => `${item.schedule}|${item.itemNo}|${item.quantitySinceLastBillRaw}|${item.amountSinceLastBill}` === duplicateKey)) continue;

    items.push({
      dsrCode: code,
      itemNo: code,
      description,
      unit: row.unit,
      quantitySinceLastBill: quantity,
      quantitySinceLastBillRaw: quantityRaw,
      agreementRate,
      agreementRateRaw,
      amountAtAgreementRateSinceLastBill: amountAt,
      amountIncludingSpecialConditionSinceLastBill: specialAmount,
      amountSinceLastBill: specialAmount,
      schedule,
      scheduleGroup: schedule,
      chapter,
      groupName,
      sourceBook,
      ...materials,
      confidence: 'high',
      reason: 'Deterministic column extraction verified by Qty x Agreement Rate.',
    });
  }

  const printedScheduleSummary = parsePrintedScheduleSummaries(markdown);
  let payableItems = items;
  let unresolvedScheduleCount = 0;
  if (printedScheduleSummary.length > 0) {
    const targetBySchedule = new Map(printedScheduleSummary.map(summary => [summary.schedule, summary.amountIncludingSpecialCondition]));
    payableItems = items.filter(item => (targetBySchedule.get(item.schedule) || 0) > 0);
    for (const summary of printedScheduleSummary) {
      if (!(summary.amountIncludingSpecialCondition > 0)) continue;
      const extractedAmount = payableItems
        .filter(item => item.schedule === summary.schedule)
        .reduce((sum, item) => sum + item.amountSinceLastBill, 0);
      const unresolvedAmount = Math.round((summary.amountIncludingSpecialCondition - extractedAmount) * 100) / 100;
      if (unresolvedAmount > 0.05) {
        unresolvedScheduleCount += 1;
        warnings.push(`${summary.schedule}: Rs ${unresolvedAmount.toFixed(2)} could not be broken into verified item rows and requires manual review.`);
        payableItems.push({
          dsrCode: `REVIEW-${summary.schedule.replace(/\D/g, '') || summary.schedule.replace(/\W/g, '')}`,
          itemNo: `REVIEW-${summary.schedule.replace(/^Schedule\s+/i, '')}`,
          description: `${summary.schedule} unresolved current-payable items - manual item breakup required`,
          unit: 'LS',
          quantitySinceLastBill: 1,
          quantitySinceLastBillRaw: '1',
          agreementRate: unresolvedAmount,
          agreementRateRaw: unresolvedAmount.toFixed(2),
          amountAtAgreementRateSinceLastBill: unresolvedAmount,
          amountIncludingSpecialConditionSinceLastBill: unresolvedAmount,
          amountSinceLastBill: unresolvedAmount,
          schedule: summary.schedule,
          scheduleGroup: summary.schedule,
          chapter: 'Manual review required',
          groupName: '',
          sourceBook: 'UNKNOWN',
          isCementAffected: false,
          isSteelItem: false,
          steelType: '',
          confidence: 'low',
          reason: 'The printed schedule amount is authoritative, but wrapped PDF rows could not be reconstructed safely.',
        });
      }
    }
  }

  const billAmountLine = markdown.split(/\r?\n/).find(line => /Bill Amount\s*\(Rs\.?\)/i.test(line)) || '';
  const billAmountValues = billAmountLine
    ? (billAmountLine.match(NUMBER_PATTERN) || [])
      .map(value => toNumber(value))
      .filter((value): value is number => value !== undefined && value > 0)
    : [];
  const billAmount = billAmountValues[0];
  const itemAmountTotal = Math.round(payableItems.reduce((sum, item) => sum + item.amountSinceLastBill, 0) * 100) / 100;
  const amountDifference = billAmount === undefined ? undefined : Math.round((itemAmountTotal - billAmount) * 100) / 100;
  const amountsReconciled = amountDifference !== undefined && Math.abs(amountDifference) <= 0.05;
  if (!amountsReconciled) warnings.push('Extracted item amounts require review against the printed Bill Amount.');

  return {
    billNo: markdown.match(/Bill No\.\s*([^\r\n]+)/i)?.[1]?.trim() || '',
    agreementNo: markdown.match(/Agreement No\.\s*([^\s]+)\s+Agreement Date/i)?.[1]?.trim() || '',
    contractorName: '',
    workDescription: '',
    measurementDate: isoDate(markdown.match(/Measurement Date (?:From|To)\s+([^\r\n]+)/i)?.[1]),
    grossBillAmount: billAmount,
    scheduleSummary: printedScheduleSummary.length > 0 ? printedScheduleSummary : parseItemScheduleSummaries(payableItems),
    scheduleSummaryTotal: billAmount,
    itemAmountTotal,
    amountDifference,
    amountsReconciled,
    items: payableItems,
    warnings,
  };
}
