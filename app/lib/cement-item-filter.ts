import type { ParsedBillData, ParsedLineItem } from './bill-text-parser';

export type CementItemKind = 'cement_supply' | 'cement_affected' | 'non_cement';

export interface CementItemClassification {
  item: ParsedLineItem;
  kind: CementItemKind;
  reason: string;
}

export interface CementFilterResult {
  cementSupplyItems: CementItemClassification[];
  cementAffectedItems: CementItemClassification[];
  nonCementItems: CementItemClassification[];
  dedicatedCementAmountSinceLastBill: number;
  dedicatedCementAmountUptoDate: number;
  cementAffectedAmountSinceLastBill: number;
  cementAffectedAmountUptoDate: number;
}

const CEMENT_SUPPLY_PATTERNS = [
  /\bordinary\s+portland\s+cement\b/i,
  /\bopc\b/i,
  /\bppc\b/i,
  /\bsupply(?:ing)?\s+(?:of\s+)?cement\b/i,
  /\bcost\s+of\s+cement\b/i,
  /\bcements?\s+(?:43|53)\s+grade\b/i,
];

const CEMENT_WORK_PATTERNS = [
  /\bcement\b/i,
  /\bconcrete\b/i,
  /\br\.?\s*c\.?\s*c\.?\b/i,
  /\brcc\b/i,
  /\bpcc\b/i,
  /\bcc\s+blocks?\b/i,
  /\bmortar\b/i,
  /\bpointing\b/i,
  /\bplaster(?:ing)?\b/i,
  /\b1\s*:\s*\d+(?:\.\d+)?\s*:\s*\d+/i,
  /\b1\s*:\s*\d+\b/i,
];

const STEEL_ONLY_PATTERNS = [
  /\bthermo[-\s]*mechanically\s+treated\b/i,
  /\btmt\b/i,
  /\bfe[-\s]*500/i,
  /\breinforcement\s+(?:bars?|steel)\b/i,
];

function normalize(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export function classifyCementItem(item: ParsedLineItem): CementItemClassification {
  const description = normalize(item.description || '');
  const chapter = normalize(item.chapterName || '');
  const schedule = normalize(item.schedule || '');
  const combined = `${description} ${chapter} ${schedule}`;

  const isSupplyByUnit = /^MT$/i.test(item.unit || '') && /cement/i.test(combined);
  const isSupplyBySchedule = /^A2$/i.test(schedule) && /cement/i.test(combined);
  const isSupplyByText = CEMENT_SUPPLY_PATTERNS.some(pattern => pattern.test(combined));

  if (isSupplyByUnit || isSupplyBySchedule || isSupplyByText) {
    return {
      item,
      kind: 'cement_supply',
      reason: 'Dedicated cement supply item. Use its amount as Bill.cementAmount.',
    };
  }

  const isSteelOnly = STEEL_ONLY_PATTERNS.some(pattern => pattern.test(combined));
  if (isSteelOnly) {
    return {
      item,
      kind: 'non_cement',
      reason: 'Steel-only item, not a cement work item.',
    };
  }

  const isCementAffected = CEMENT_WORK_PATTERNS.some(pattern => pattern.test(combined));
  if (isCementAffected) {
    return {
      item,
      kind: 'cement_affected',
      reason: 'Work item uses cement/concrete/mortar/RCC terminology. Keep in classification entries.',
    };
  }

  return {
    item,
    kind: 'non_cement',
    reason: 'No cement supply or cement-work keywords found.',
  };
}

export function filterCementItems(parsedBill: ParsedBillData): CementFilterResult {
  const classified = parsedBill.lineItems.map(classifyCementItem);
  const cementSupplyItems = classified.filter(entry => entry.kind === 'cement_supply');
  const cementAffectedItems = classified.filter(entry => entry.kind === 'cement_affected');
  const nonCementItems = classified.filter(entry => entry.kind === 'non_cement');

  const sumSinceLast = (entries: CementItemClassification[]) =>
    entries.reduce((sum, entry) => sum + (entry.item.amountSinceLastBillIncSpCond || entry.item.amountSinceLastBill || 0), 0);

  const sumUptoDate = (entries: CementItemClassification[]) =>
    entries.reduce((sum, entry) => sum + (entry.item.totalUptoDateAmount || 0), 0);

  return {
    cementSupplyItems,
    cementAffectedItems,
    nonCementItems,
    dedicatedCementAmountSinceLastBill: sumSinceLast(cementSupplyItems),
    dedicatedCementAmountUptoDate: sumUptoDate(cementSupplyItems),
    cementAffectedAmountSinceLastBill: sumSinceLast(cementAffectedItems),
    cementAffectedAmountUptoDate: sumUptoDate(cementAffectedItems),
  };
}
