import { normalizeDsrCode } from './dsr-cement-calculation';

export interface CementBreakdownItem {
  schedule: string;
  amount: number;
  codes: string[];
  /** Breakup behind the amount, for display on the cement row. */
  cementQtyMT?: number;
  ratePerMt?: number;
  affectedItemCount?: number;
  /** Per-item cement quantity (+ how it was derived), for one item row per contributing item. */
  items?: Array<{ code: string; cementQtyMT: number; sourceQty?: number; coefficient?: number; workUnit?: string }>;
}

interface EntryLike {
  amount: number | string | '';
  scheduleItem?: string;
  itemNumber?: string;
  itemRows?: Array<{ itemNumber?: string }>;
  isDerivedCement?: boolean;
  [k: string]: any;
}

const num = (v: any) => (v === '' || v == null ? 0 : typeof v === 'string' ? parseFloat(v) || 0 : v);
const schedOf = (e: EntryLike) => (String(e.scheduleItem || '').trim() || 'Default');

function entryCodes(e: EntryLike): string[] {
  const rows = e.itemRows?.length ? e.itemRows : [{ itemNumber: e.itemNumber }];
  return rows.map(r => normalizeDsrCode(String(r.itemNumber || ''))).filter(Boolean);
}

/** A saved bill does not carry the isDerivedCement flag, so the rows are recognised by
 *  the descriptions both generators write: "Cement (derived) — <schedule>" from the DSR
 *  path, "... (Cement Portion)" from the PDF path. */
export function isDerivedCementEntry(e: EntryLike): boolean {
  if (e.isDerivedCement) return true;
  const d = String(e.description || '');
  return /^cement \(derived\)/i.test(d.trim()) || /\(cement portion\)/i.test(d);
}

/** The work-item codes a derived-cement row was computed from. Both generators put the
 *  contributing code in the cement row's own item rows — "5.35 (Cement)", "1130-CEM". */
function contributingCodes(e: EntryLike): string[] {
  const rows = e.itemRows?.length ? e.itemRows : [{ itemNumber: e.itemNumber }];
  return rows
    .map(r => normalizeDsrCode(String(r.itemNumber || '').replace(/\s*\(cement\)\s*$/i, '').replace(/-CEM$/i, '')))
    .filter(Boolean);
}

/**
 * Folds derived cement back into the work items it was taken out of, and drops the
 * cement rows — the exact reverse of applyCementSplit.
 *
 * Needed because a DSR/USSOR item's rate already includes its cement, and its work
 * classification already carries a cement share. Splitting that cement into a "C"
 * sub-classification prices the same cement through the cement index a second time and
 * takes it out of the class that was meant to carry it. Where an agreement is read that
 * way, the split has to come off the bills it was applied to.
 *
 * The money goes back to the same items it came from — the cement row records their
 * codes — so the bill total is unchanged and every row returns to its pre-split value.
 */
export function undoCementSplit<T extends EntryLike>(entries: T[]): T[] {
  const cementRows = entries.filter(isDerivedCementEntry);
  if (cementRows.length === 0) return entries;

  const work: T[] = entries.filter(e => !isDerivedCementEntry(e)).map(e => ({ ...e }));

  for (const cementRow of cementRows) {
    const amount = num(cementRow.amount);
    if (amount === 0) continue;
    const schedule = schedOf(cementRow);
    const codes = new Set(contributingCodes(cementRow));

    // The items it came out of: those whose code contributed, or — when the row kept no
    // codes — every item on its schedule, which is the set the split drew from.
    let affected = work.filter(e => schedOf(e) === schedule && entryCodes(e).some(c => codes.has(c)));
    if (affected.length === 0) affected = work.filter(e => schedOf(e) === schedule);
    if (affected.length === 0) affected = work;
    if (affected.length === 0) continue;

    const total = affected.reduce((sum, e) => sum + num(e.amount), 0);
    if (total > 0) {
      // Proportionally, as it was taken. The last row absorbs the rounding so the bill
      // total comes back to exactly what it was.
      let given = 0;
      affected.forEach((e, index) => {
        const share = index === affected.length - 1
          ? Math.round((amount - given) * 100) / 100
          : Math.round(amount * (num(e.amount) / total) * 100) / 100;
        given = Math.round((given + share) * 100) / 100;
        e.amount = Math.round((num(e.amount) + share) * 100) / 100;
      });
    } else {
      const share = Math.round((amount / affected.length) * 100) / 100;
      for (const e of affected) e.amount = Math.round((num(e.amount) + share) * 100) / 100;
    }
  }

  return work;
}

/**
 * Splits derived cement out of the work items into their own cement classification
 * entries — matching the AI PDF flow — while keeping the bill total unchanged.
 *
 * For each schedule, the schedule's cement cost is removed from its cement-affected
 * items (the ones whose DSR code matched a coefficient) proportionally, and a single
 * "Cement (derived)" entry carrying that cost is added under the cement classification.
 *
 * Idempotent: any previous derived-cement entries are folded back into their items
 * first, so re-applying with a new rate re-splits cleanly instead of stacking up.
 */
export function applyCementSplit<T extends EntryLike>(
  entries: T[],
  breakdown: CementBreakdownItem[],
  makeCementEntry: (item: CementBreakdownItem, amount: number) => T,
): T[] {
  // 1. Separate prior derived-cement entries from the work items.
  const oldCementBySched = new Map<string, number>();
  const work: T[] = [];
  for (const e of entries) {
    if (e.isDerivedCement) {
      const s = schedOf(e);
      oldCementBySched.set(s, (oldCementBySched.get(s) || 0) + num(e.amount));
    } else {
      work.push({ ...e });
    }
  }

  const newBySched = new Map(breakdown.map(b => [String(b.schedule || '').trim() || 'Default', b]));
  const schedules = new Set<string>([...oldCementBySched.keys(), ...newBySched.keys()]);

  const cementEntries: T[] = [];
  for (const s of schedules) {
    const oldC = oldCementBySched.get(s) || 0;
    const bd = newBySched.get(s);
    const newC = bd ? Math.round(bd.amount * 100) / 100 : 0;
    const codeSet = new Set((bd?.codes || []).map(c => normalizeDsrCode(c)).filter(Boolean));

    // The items this schedule's cement comes out of: matched-code items, or (if we have
    // no code list) every item on the schedule as a fallback.
    const affected = work.filter(e =>
      schedOf(e) === s && (codeSet.size === 0 || entryCodes(e).some(c => codeSet.has(c))));
    const curTotal = affected.reduce((sum, e) => sum + num(e.amount), 0);
    const originalTotal = curTotal + oldC;          // fold the old split back in first
    const target = Math.max(0, originalTotal - newC);
    if (curTotal > 0 && affected.length > 0) {
      const factor = target / curTotal;
      for (const e of affected) e.amount = Math.round(num(e.amount) * factor * 100) / 100;
    }
    if (newC > 0 && bd) cementEntries.push(makeCementEntry(bd, newC));
  }

  return [...work, ...cementEntries];
}
