/**
 * Turning an extracted bill PDF into classification entries.
 *
 * One implementation, used by every screen that reads a bill PDF — the single-bill
 * form, bulk entry, and the edit page. It used to be copied into each page, and the
 * copies drifted: bulk's had lost the cement split, so applying the cement
 * calculation there deducted the cement from each item and then dropped it, leaving
 * the bill short by its whole cement value. The same PDF gave two different answers
 * depending on which screen read it.
 *
 * Callers pass their own classification groups and contract schedules; nothing here
 * touches React or the network.
 */

import { scheduleNames } from './contract-schedules';
import { matchExtractedSchedule, scheduleWorkName } from './bill-schedule-matching';
import { enforceSteelSubclassNature } from './work-classification';

export interface ExtractedSubClassification {
  id: string;
  code: string;
  name: string;
  groupId: string;
  isDefault?: boolean;
  [key: string]: any;
}

export interface ExtractedClassificationGroup {
  id: string;
  code: string;
  subClassifications: ExtractedSubClassification[];
  [key: string]: any;
}

export interface ExtractedItemRow {
  itemNumber: string;
  quantity: number | string | '';
  agreementRate: number | string | '';
  /**
   * What the bill actually pays for this row — the "Amt including Special Condition"
   * column, not Qty x Rate. The two differ wherever a special condition revises or
   * deducts from the rate, and on a row paying a rate revision the quantity is zero, so
   * Qty x Rate is zero while the bill pays lakhs. Everything downstream that rebuilds a
   * total from rows must start from this figure and fall back to Qty x Rate only for
   * rows saved before it existed.
   */
  amount?: number;
  /**
   * What this item is, kept per row.
   *
   * Items sharing a classification are merged into one entry, and the entry then
   * carries the sub-work's name and the first item's justification. Everything that
   * told the five items apart was dropped on the way — so a schedule of ballast,
   * track-lifting and rail-laying showed as one line reading "Provision of CC apron and
   * Complete Track renewal", with no way to see what each number was for.
   */
  description?: string;
  /** Which page of the bill PDF it was read from. */
  pageNumber?: number;
  /** Set when the wording was completed from a published schedule of rates. */
  /** Which book priced this item — recorded whenever the book knows the code. */
  rateBookEdition?: string;
  rateBookCode?: string;
  /** True only when the DESCRIPTION shown was taken from that book, not the bill. */
  rateBookWording?: boolean;
  /** Cement rows carry their derivation so the report can print the working. */
  sourceQty?: number;
  coefficient?: number;
  workUnit?: string;
  /**
   * Which of Clause 46A.9(1)'s steel categories THIS item draws on.
   *
   * Kept per row as well as on the entry, because one entry can hold both kinds: a
   * Schedule B of steel doors and windows merges 5.22.6 (reinforcement — TMT) with
   * 10.2 and 10.16.1 (structural steelwork — angles, plates, flats). The entry's own
   * list is the union of them, and pricing the whole amount on a union prices the
   * reinforcement as angles and the angles as reinforcement. With the categories on
   * each row, each item's steel is priced on its own index.
   */
  steelTypes?: string[];
}

export interface BuiltClassificationEntry {
  subClassificationId: string;
  subClassification?: ExtractedSubClassification;
  amount: number | string | '';
  description?: string;
  classificationJustification?: string;
  steelTypes?: string[];
  scheduleItem?: string;
  itemNumber?: string;
  quantity?: number | string | '';
  agreementRate?: number | string | '';
  itemRows?: ExtractedItemRow[];
  aiReviewed?: boolean;
  manualClassification?: boolean;
  isDerivedCement?: boolean;
  mainClassificationGroupId?: string;
}

export interface BuildEntriesOptions {
  classificationGroups: ExtractedClassificationGroup[];
  /** The contract's schedules, so each item lands under the right one. */
  contractSchedules?: unknown;
}

/**
 * The sub-classification an extracted item belongs to, or null when its code names
 * no group we know.
 *
 * Falls back within the same main group — "<digit>A", then the group's default, then
 * its first — so an item whose exact suffix has no row (a single-class group, or a
 * bare "5") still gets a valid sub-classification instead of being dropped.
 */
/**
 * The 46A.9(1) steel categories an item is priced against.
 *
 * Prefers the full list the reader worked out, because an item can draw on several:
 * structural steel work in built-up sections is angles, channels and plates together.
 * Falls back to the single type for items read before the list existed, and for the AI
 * path, which returns one.
 */
function steelCategoriesOf(item: {
  isSteelItem?: boolean;
  steelType?: string;
  steelTypesUsed?: string[];
}): string[] {
  if (!item.isSteelItem) return [];
  if (item.steelTypesUsed?.length) return [...item.steelTypesUsed];
  return item.steelType ? [item.steelType] : [];
}

export function findSubClassificationForExtractedItem(
  item: { suggestedClassificationCode?: string | null; description?: string | null },
  classificationGroups: ExtractedClassificationGroup[],
): ExtractedSubClassification | null {
  let code = (item.suggestedClassificationCode || '').trim().toUpperCase();
  if (!code) return null;
  const allSubs = classificationGroups.flatMap((group) => group.subClassifications || []);

  // The deterministic steel-nature guard: an AI pick of …B for a non-TMT item (MS
  // bolts, structural trusses — real cases) is corrected to …D here, where every
  // extracted item passes, instead of hoping the prompt was obeyed. Falls back to the
  // AI's code when the group has no …D class.
  const corrected = enforceSteelSubclassNature(code, item.description);
  if (corrected !== code && allSubs.some((sub) => sub.code.toUpperCase() === corrected)) {
    code = corrected;
  }

  const exact = allSubs.find((sub) => sub.code.toUpperCase() === code);
  if (exact) return exact;

  const digit = code.match(/^\d+/)?.[0];
  const group = digit ? classificationGroups.find((g) => g.code.toUpperCase() === digit) : undefined;
  if (group && group.subClassifications?.length) {
    return group.subClassifications.find((sub) => sub.code.toUpperCase() === `${digit}A`)
      || group.subClassifications.find((sub) => sub.isDefault)
      || group.subClassifications[0];
  }
  return null;
}

/**
 * Builds the classification entries for an extracted bill.
 *
 * Items printed under the same "Group Name" with the same classification are merged
 * into one entry holding several item rows, rather than one entry per line.
 */
export function buildClassificationEntriesFromExtractedBill(
  data: { billDetails?: { items?: any[] } | undefined; extractedItems?: any[] | undefined },
  options: BuildEntriesOptions,
): BuiltClassificationEntry[] {
  const { classificationGroups, contractSchedules } = options;
  const items: any[] = data.billDetails?.items || data.extractedItems || [];
  const allSubClassifications = classificationGroups.flatMap((group) => group.subClassifications || []);
  const schedules = scheduleNames(contractSchedules as any);

  let ungroupedCounter = 0;

  const rawEntries: Array<{ groupKey: string; entry: BuiltClassificationEntry }> = items.flatMap((item) => {
    const subClassification = findSubClassificationForExtractedItem(item, classificationGroups);
    if (!subClassification) return [];

    const qtySinceLast = Number(item.quantitySinceLastBill || 0);
    const specialConditionOnly = qtySinceLast === 0
      && Number(item.amountAtAgreementRateSinceLastBill || 0) === 0
      && Number(item.amountIncludingSpecialConditionSinceLastBill || item.amountSinceLastBill || 0) > 0;

    const groupName = (item.groupName || '').trim();
    const baseKey = groupName || `__standalone_${ungroupedCounter++}`;

    const originalAmount = item.originalAmount;
    const netAmount = Number(item.amountSinceLastBill || 0);
    const hasDeduction = typeof originalAmount === 'number' && originalAmount > netAmount;

    if (hasDeduction) {
      const cementCost = item.cementDeduction || (originalAmount - netAmount);
      // Store cement in MT at a per-MT rate. The "derive cement from items" path
      // already does, and the report's cement breakup is headed MT — carrying
      // quintals here made the statement read "243.87 MT at Rs 599.78/MT", ten times
      // the quantity at a tenth of the rate. The product was right, so the amount
      // was never wrong, but both figures on the page were.
      const quintals = Number(item.cementQuantityQuintals) || 0;
      const ratePerQuintal = Number(item.cementRatePerQuintal) || 0;
      const cementQty = quintals / 10;
      const cementRate = ratePerQuintal ? ratePerQuintal * 10 : '';

      const mainCode = subClassification.code.charAt(0);
      const cementSub = allSubClassifications.find((sub) => sub.code.toUpperCase() === `${mainCode}C`);

      if (cementSub) {
        const scheduleItem = matchExtractedSchedule(schedules, [item.schedule, item.scheduleGroup, item.chapter]);
        const qty = Number(item.quantitySinceLastBill || 0);
        const netRate = qty > 0 ? Number((netAmount / qty).toFixed(6)) : '';

        return [
          {
            groupKey: `${subClassification.id}::${baseKey}`,
            entry: {
              subClassificationId: subClassification.id,
              subClassification,
              amount: netAmount,
              description: groupName ? groupName : `${item.description || ''} (Excluding Cement)`,
              steelTypes: steelCategoriesOf(item),
              scheduleItem,
              itemNumber: item.itemNo || '',
              quantity: qty || '',
              agreementRate: netRate,
              itemRows: [{
                itemNumber: item.itemNo || '',
                quantity: qty || '',
                agreementRate: netRate,
                amount: netAmount,
                description: item.description || '',
                steelTypes: steelCategoriesOf(item),
                pageNumber: (item as any).pageNumber,
                rateBookEdition: (item as any).rateBookEdition,
                rateBookCode: (item as any).rateBookCode,
                rateBookWording: !!(item as any).rateBookDescription,
              }],
              classificationJustification: item.suggestedClassificationReason || '',
              aiReviewed: !!item.classificationReviewedByAi,
            },
          },
          {
            groupKey: `${cementSub.id}::${baseKey}`,
            entry: {
              subClassificationId: cementSub.id,
              subClassification: cementSub,
              amount: cementCost,
              description: groupName ? `${groupName} (Cement Portion)` : `${item.description || ''} (Cement Portion)`,
              steelTypes: [],
              scheduleItem,
              itemNumber: item.itemNo ? `${item.itemNo}-CEM` : 'CEM',
              quantity: cementQty || '',
              agreementRate: cementRate,
              itemRows: [{
                itemNumber: item.itemNo ? `${item.itemNo}-CEM` : 'CEM',
                quantity: cementQty || '',
                agreementRate: cementRate,
                amount: cementCost,
                description: item.description || '',
                pageNumber: (item as any).pageNumber,
                // Keep the derivation with the row so the report prints the working.
                sourceQty: item.cementSourceQty,
                coefficient: item.cementCoefficient,
                workUnit: item.cementWorkUnit,
              }],
              classificationJustification: `Under GCC Clause 46A, this is the cement portion of item ${item.itemNo || ''} (${item.description || ''}). Its cement cost is derived from the DSR cement coefficient and classified under Sub-classification ${cementSub.code}${cementSub.name ? ` (${cementSub.name})` : ''} so that the cement price index is applied to this value.`,
            },
          },
        ];
      }
    }

    // Default: one entry for the item.
    const itemNumber = item.itemNo || item.dsrCode || '';
    const itemQuantity = specialConditionOnly ? '' : (item.quantitySinceLastBillRaw || item.quantitySinceLastBill || '');
    const itemRate = specialConditionOnly ? '' : (item.agreementRateRaw || item.agreementRate || '');
    return [{
      groupKey: `${subClassification.id}::${baseKey}`,
      entry: {
        subClassificationId: subClassification.id,
        subClassification,
        amount: Number(item.amountSinceLastBill || 0),
        description: (() => {
          // The A schedules print a "Group Name" heading over their items; the B
          // schedules do not, and their sub-work is named in the schedule heading's
          // own tail instead. Without it the entry fell back to the item's wording,
          // and the list read as pipes and shutters where every A entry read as the
          // work it belonged to.
          const subWork = groupName
            || scheduleWorkName(String(item.scheduleHeading || item.schedule || item.scheduleGroup || ''));
          if (subWork) return subWork;
          return specialConditionOnly
            ? `${item.description || ''} (Special condition amount; printed Qty since last Bill is 0)`
            : item.description || '';
        })(),
        steelTypes: steelCategoriesOf(item),
        scheduleItem: matchExtractedSchedule(schedules, [item.schedule, item.scheduleGroup, item.chapter]),
        itemNumber,
        quantity: itemQuantity,
        agreementRate: itemRate,
        itemRows: [{
          itemNumber,
          quantity: itemQuantity,
          agreementRate: itemRate,
          // Kept even when the printed quantity is zero: the special-condition amount
          // is still paid, and an entry with no rows vanished from the schedule items
          // of the statement while its money stayed in the total.
          amount: Number(item.amountSinceLastBill) || 0,
          description: item.description || '',
          steelTypes: steelCategoriesOf(item),
          pageNumber: (item as any).pageNumber,
          rateBookEdition: (item as any).rateBookEdition,
          rateBookCode: (item as any).rateBookCode,
          rateBookWording: !!(item as any).rateBookDescription,
        }],
        classificationJustification: item.suggestedClassificationReason || '',
        aiReviewed: !!item.classificationReviewedByAi,
      },
    }];
  });

  const merged = new Map<string, BuiltClassificationEntry>();
  const order: string[] = [];
  for (const { groupKey, entry } of rawEntries) {
    const existing = merged.get(groupKey);
    if (!existing) {
      merged.set(groupKey, { ...entry, itemRows: [...(entry.itemRows || [])] });
      order.push(groupKey);
      continue;
    }
    existing.itemRows = [...(existing.itemRows || []), ...(entry.itemRows || [])];
    existing.amount = (Number(existing.amount) || 0) + (Number(entry.amount) || 0);
    existing.steelTypes = Array.from(new Set([...(existing.steelTypes || []), ...(entry.steelTypes || [])]));
    existing.aiReviewed = existing.aiReviewed || entry.aiReviewed;
    if (!existing.classificationJustification) {
      existing.classificationJustification = entry.classificationJustification || '';
    }
  }

  return order.map((key) => {
    const entry = merged.get(key)!;
    const firstRow = entry.itemRows?.[0];
    if (firstRow) {
      entry.itemNumber = firstRow.itemNumber;
      entry.quantity = firstRow.quantity;
      entry.agreementRate = firstRow.agreementRate;
    }
    return entry;
  });
}
