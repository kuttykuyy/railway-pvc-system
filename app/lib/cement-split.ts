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
