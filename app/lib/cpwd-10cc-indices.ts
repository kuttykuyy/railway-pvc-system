import { prisma } from './db';

/**
 * The base (tender-receipt month) and current (bill month) index values 10CC needs, read
 * from the app's existing WPI/CPI monthly data — All-India WPI All-Commodities for other
 * materials, WPI Fuel & Power for POL, and CPI-IW (the "Labour" index) for labour.
 *
 * A month that has not been published yet holds the latest earlier value (same rule as the
 * CPWD price feed). The current month is bridged to the base month's WPI series so a bill
 * month on the 2022-23 base is comparable to a pre-rebase base — the same bridge the
 * Railway engine uses. Labour (CPI-IW) is not a WPI index, so it is never bridged here.
 *
 * NOTE: 10CC labour is, strictly, a minimum-wage index; CPI-IW is used as the available
 * proxy and flagged. If a POL/WPI index has no stored months, that pair comes back null and
 * the component contributes zero rather than a guessed figure.
 */

/** index key → the PriceIndex name it reads. */
export const CPWD_10CC_INDEX_NAMES = {
  labour: 'Labour',
  materials: 'RBI Other Materials',
  pol: 'WPI Fuel & Power',
} as const;

export type Cpwd10ccIndexKey = keyof typeof CPWD_10CC_INDEX_NAMES;

/** Latest published month not after the target — pure, tested on its own. */
export function pickMonthlyValue(
  rows: Array<{ month: string; value: number }>,
  targetMonth: string,
): { month: string; value: number } | null {
  let best: { month: string; value: number } | null = null;
  for (const r of rows) {
    if (r.month > targetMonth) continue;
    if (!best || r.month > best.month) best = r;
  }
  return best;
}

export interface Cpwd10ccIndexPair {
  base: number | null;
  current: number | null;
  baseMonthUsed: string | null;
  currentMonthUsed: string | null;
}

export async function getCpwd10ccIndices(
  tenderMonth: string,
  billMonth: string,
): Promise<Record<Cpwd10ccIndexKey, Cpwd10ccIndexPair>> {
  const { getWpiLinkingFactors, bridgeWpiValue } = await import('./wpi-series');
  const factors = await getWpiLinkingFactors();

  const names = Object.values(CPWD_10CC_INDEX_NAMES) as string[];
  const indices = await prisma.priceIndex.findMany({ where: { name: { in: names } }, select: { id: true, name: true } });
  const idByName = new Map(indices.map(i => [i.name, i.id]));

  const allValues = indices.length
    ? await prisma.monthlyIndexValue.findMany({
        where: { priceIndexId: { in: indices.map(i => i.id) } },
        select: { priceIndexId: true, month: true, value: true },
      })
    : [];
  const byIndex = new Map<string, Array<{ month: string; value: number }>>();
  for (const v of allValues) {
    const arr = byIndex.get(v.priceIndexId) || [];
    arr.push({ month: new Date(v.month).toISOString().slice(0, 7), value: v.value });
    byIndex.set(v.priceIndexId, arr);
  }

  const tenderDate = new Date(`${tenderMonth}-01T00:00:00.000Z`);
  const out = {} as Record<Cpwd10ccIndexKey, Cpwd10ccIndexPair>;
  for (const key of Object.keys(CPWD_10CC_INDEX_NAMES) as Cpwd10ccIndexKey[]) {
    const name = CPWD_10CC_INDEX_NAMES[key];
    const id = idByName.get(name);
    const rows = id ? byIndex.get(id) || [] : [];
    const base = pickMonthlyValue(rows, tenderMonth);
    const current = pickMonthlyValue(rows, billMonth);
    let currentVal = current?.value ?? null;
    if (currentVal != null && current) {
      // Convert a new-series bill month up to the base month's series (no-op otherwise).
      const publishedDate = new Date(`${current.month}-01T00:00:00.000Z`);
      currentVal = bridgeWpiValue(name, tenderDate, publishedDate, currentVal, factors);
    }
    out[key] = {
      base: base?.value ?? null,
      current: currentVal,
      baseMonthUsed: base?.month ?? null,
      currentMonthUsed: current?.month ?? null,
    };
  }
  return out;
}
