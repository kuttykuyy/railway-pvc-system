/**
 * Finding items on a bill that were ordered AFTER the agreement.
 *
 * GCC-2022 Cl.46A.1(b): an extra item under Cl.39 — work that was not in the tender and
 * whose rate was fixed during execution — is outside price variation, unless PVC and a
 * base month were specially agreed when its rate was fixed. Extra quantity of an
 * existing item (Cl.42) is NOT excluded, and neither are the non-schedule items a tender
 * itself carries in its B schedule: those are part of the contract and attract PVC.
 *
 * IREPS prints the items added during execution under their own schedule heading —
 * "Schedule D-Additional NS item", "Schedule E - Extra items" — so the heading is what
 * tells them apart from the tender's own "Schedule B2-Items which are not covered by
 * USSOR". (An earlier version compared item numbers against the LOA's B-schedule lists;
 * the LOA is no longer read for schedules, and the heading is the better signal anyway.)
 *
 * Nothing here excludes anything. It reports candidates and their value for a person to
 * confirm: an item wrongly called extra costs the contractor its price variation.
 */

export interface BillItemForExtraCheck {
  itemNo?: string;
  dsrCode?: string;
  description?: string;
  schedule?: string;
  scheduleGroup?: string;
  scheduleHeading?: string;
  amountSinceLastBill?: number;
  pageNumber?: number;
}

export interface ExtraItemCandidate {
  itemNo: string;
  description: string;
  schedule: string;
  amount: number;
  pageNumber?: number;
}

export interface ExtraItemsReport {
  /** Items printed under an "additional / extra NS item" schedule. */
  candidates: ExtraItemCandidate[];
  /** Their total, ready to be offered as the amount outside PVC. */
  total: number;
  /** The schedule headings those items sat under, as printed. */
  schedules: string[];
}

/**
 * Whether a schedule heading names items added after the agreement.
 *
 * "Additional NS item", "Extra NS items", "New non-schedule items", "Extra items" all
 * qualify. A tender's own NS schedule — "Items which are not covered by USSOR",
 * "Schedule B - NS items" — does not: it says nothing about being added later.
 */
export function isAdditionalNsSchedule(heading: string): boolean {
  const text = String(heading || '').toUpperCase().replace(/[^A-Z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!text) return false;
  const later = /\b(ADDITIONAL|EXTRA|NEW|SUPPLEMENTARY)\b/;
  const ns = /\b(NS|N S|NON SCHEDULE|NON SCHEDULED|EXTRA ITEMS?)\b/;
  return later.test(text) && ns.test(text);
}

export function findAdditionalNsItems(items: BillItemForExtraCheck[]): ExtraItemsReport {
  const candidates: ExtraItemCandidate[] = [];
  const schedules = new Set<string>();

  for (const item of items || []) {
    const heading = [item.scheduleHeading, item.schedule, item.scheduleGroup]
      .map(value => String(value || '').trim())
      .find(isAdditionalNsSchedule);
    if (!heading) continue;
    const amount = Number(item.amountSinceLastBill) || 0;
    if (amount === 0) continue;
    schedules.add(heading);
    candidates.push({
      itemNo: String(item.itemNo || item.dsrCode || '').trim(),
      description: String(item.description || '').trim(),
      schedule: heading,
      amount,
      pageNumber: item.pageNumber,
    });
  }

  return {
    candidates,
    total: Math.round(candidates.reduce((sum, c) => sum + c.amount, 0) * 100) / 100,
    schedules: Array.from(schedules),
  };
}
