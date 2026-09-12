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
  /** Items printed under an "additional / extra NS item" schedule, or an NS schedule the LOA does not carry. */
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
  const later = /\b(ADDITIONAL|ADDL|EXTRA|NEW|NEWLY|SUPPLEMENTARY|SUPPL)\b/;
  const ns = /\b(NS|N S|NSI|NON SCHEDULE|NON SCHEDULED|NONSCHEDULE|EXTRA ITEMS?)\b/;
  if (later.test(text) && ns.test(text)) return true;
  // "Schedule E - Newly added items", "Additional items", "Items added during execution":
  // the "added later" sense without the letters NS. The later-word must sit right by
  // ITEM(S) so "New BG line works items" — a work title — is not read as an addition.
  if (/\b(?:ADDITIONAL|ADDL|EXTRA|NEW|NEWLY ADDED|SUPPLEMENTARY|SUPPL)\s+(?:NON\s+SCHEDULED?\s+|N\s?S\s+)?ITEMS?\b/.test(text)) return true;
  if (/\bITEMS?\s+(?:ADDED|INTRODUCED|SANCTIONED)\s+(?:DURING|AFTER|SUBSEQUENT|LATER|UNDER)\b/.test(text)) return true;
  if (/\b(?:CL|CLAUSE)\s*39\b/.test(text)) return true;
  return false;
}

/** Whether a heading names a non-schedule (NS) schedule at all, added later or not. */
export function isNsSchedule(heading: string): boolean {
  const text = String(heading || '').toUpperCase().replace(/[^A-Z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  return /\b(NS|N S|NSI|NON SCHEDULE|NON SCHEDULED|NONSCHEDULE|NOT COVERED)\b/.test(text);
}

const squash = (value: string) => String(value || '').toUpperCase().replace(/[^A-Z0-9]+/g, '');
/** "Schedule F-CIVIL NS ITEM" -> "F"; "Sch. B2 - ..." -> "B2"; '' when the heading has no letter. */
export function scheduleTag(heading: string): string {
  return String(heading || '').match(/\bSCH(?:EDULE)?\.?\s*[-:]?\s*([A-Z]\d?)\b/i)?.[1]?.toUpperCase() || '';
}

/**
 * Whether a bill schedule holds items added after the agreement, given the schedules
 * the contract itself carries (from its LOA).
 *
 * The heading alone is not enough. Bill SR/MAS/GS/2023/0010/B23 prints the tender's
 * NS items under "Schedule B-NS SCHEDULE" and the items ordered during execution under
 * "Schedule E-NS New Items", "Schedule F-CIVIL NS ITEM" and "Schedule G-New NS
 * Electrical" — and F says nothing about being new, so its Rs 1.1 lakh earned PVC. What
 * tells them apart is the LOA: the tender awarded schedules A to D, so an NS schedule
 * lettered E, F or G was not in the tender. When the contract's schedules are known,
 * an NS schedule that is not one of them is an addition; when they are not known, only
 * the heading's own wording can decide.
 */
export function isAddedSchedule(heading: string, tenderSchedules: readonly string[] = []): boolean {
  if (isAdditionalNsSchedule(heading)) return true;
  if (!isNsSchedule(heading)) return false;
  const known = (tenderSchedules || []).map(s => String(s || '').trim()).filter(Boolean);
  if (known.length === 0) return false;
  const tag = scheduleTag(heading);
  const flat = squash(heading);
  const inTender = known.some(name => {
    const knownTag = scheduleTag(name);
    if (tag && knownTag) return tag === knownTag;
    const k = squash(name);
    return k.length > 0 && (k === flat || flat.includes(k) || k.includes(flat));
  });
  return !inTender;
}

/**
 * Whether the item NUMBER marks an item added after the agreement.
 *
 * IREPS numbers the items ordered during execution "NS01", "NS-02(I)", "NS23" — the
 * letters NS then a serial — whatever schedule heading they are printed under. The
 * tender's own non-schedule items carry plain serials ("1 (I)", "2 (I)") even when
 * their schedule is called "NS SCHEDULE". Bill SR/MAS/GS/2023/0010/B23 shows both side
 * by side, so the number is the most direct signal there is.
 */
export function isAddedItemNumber(itemNo: string | undefined | null): boolean {
  return /^\s*NS\s*[-.]?\s*\d+/i.test(String(itemNo || ''));
}

/** Added after the agreement by any of the signals: item number, heading, or the LOA's schedule list. */
export function isAddedItem(item: BillItemForExtraCheck, tenderSchedules: readonly string[] = []): boolean {
  if (isAddedItemNumber(item.itemNo) || isAddedItemNumber(item.dsrCode)) return true;
  return [item.scheduleHeading, item.schedule, item.scheduleGroup]
    .map(value => String(value || '').trim())
    .some(h => isAddedSchedule(h, tenderSchedules));
}

export function findAdditionalNsItems(items: BillItemForExtraCheck[], tenderSchedules: readonly string[] = []): ExtraItemsReport {
  const candidates: ExtraItemCandidate[] = [];
  const schedules = new Set<string>();

  for (const item of items || []) {
    if (!isAddedItem(item, tenderSchedules)) continue;
    const heading = [item.scheduleHeading, item.schedule, item.scheduleGroup]
      .map(value => String(value || '').trim())
      .find(h => isAddedSchedule(h, tenderSchedules))
      || [item.scheduleHeading, item.schedule, item.scheduleGroup].map(v => String(v || '').trim()).find(Boolean)
      || 'NS items';
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
