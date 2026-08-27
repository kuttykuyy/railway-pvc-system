import { prisma } from './db';

/**
 * The CPWD Clause 10CA material-price feed — Engine B's data source.
 *
 * 10CA does not use WPI. CPWD publishes its OWN monthly circular of base prices and an
 * All-India Price Index (AIPI, October 2012 = 100) for cement, reinforcement steel,
 * structural steel and diesel, region by region ("Base prices and indices for operation
 * of clause 10CA in contract forms PWD 7 and 8"). This is the third feed, separate from
 * the WPI and CPI-IW the Railway engine reads.
 *
 * Rows live in a raw-SQL table (`cpwd_material_prices`) created on demand by the admin
 * import route — no schema.prisma model, per the house rule that a Prisma field is never
 * declared ahead of the live database having the column. Reached only for a contract whose
 * pvcScheme routes to Engine B; the Railway path never touches any of this.
 *
 * Prices are ₹ per MT for cement/steel and ₹ per litre for diesel.
 */

/** The materials the 10CA circular carries. Diesel is stored but not priced by Engine B v1. */
export type CpwdMaterial = 'cement-opc' | 'cement-ppc' | 'steel-tmt' | 'steel-structural' | 'diesel';

export const CPWD_MATERIALS: CpwdMaterial[] = ['cement-opc', 'cement-ppc', 'steel-tmt', 'steel-structural', 'diesel'];

export const CPWD_MATERIAL_META: Record<CpwdMaterial, { label: string; unit: 'MT' | 'litre' }> = {
  'cement-opc': { label: 'Cement (OPC)', unit: 'MT' },
  'cement-ppc': { label: 'Cement (PPC)', unit: 'MT' },
  'steel-tmt': { label: 'Reinforcement steel (TMT)', unit: 'MT' },
  'steel-structural': { label: 'Structural steel', unit: 'MT' },
  'diesel': { label: 'Diesel (POL)', unit: 'litre' },
};

export interface CpwdPriceRow {
  region: string;
  material: CpwdMaterial;
  month: string;   // "YYYY-MM"
  price: number;   // ₹ per unit
  aipi: number | null;
}

/**
 * Verified seed data (Delhi NCR) so the feed is not empty on day one and Engine B can be
 * exercised end to end. Two points per material: the October-2012 base (AIPI 100) and the
 * December-2025 circular, from CPWD's published 10CA rates (cross-checked Aug 2026). More
 * months / regions are added through the admin screen.
 */
export const CPWD_SEED_ROWS: CpwdPriceRow[] = [
  // October 2012 — the AIPI base (index = 100).
  { region: 'delhi-ncr', material: 'cement-opc',       month: '2012-10', price: 3978,     aipi: 100 },
  { region: 'delhi-ncr', material: 'cement-ppc',       month: '2012-10', price: 3711,     aipi: 100 },
  { region: 'delhi-ncr', material: 'steel-tmt',        month: '2012-10', price: 45133,    aipi: 100 },
  { region: 'delhi-ncr', material: 'steel-structural', month: '2012-10', price: 41529,    aipi: 100 },
  { region: 'delhi-ncr', material: 'diesel',           month: '2012-10', price: 46.95,    aipi: 100 },
  // December 2025 — a recent circular.
  { region: 'delhi-ncr', material: 'cement-opc',       month: '2025-12', price: 4915.25,  aipi: 123.56 },
  { region: 'delhi-ncr', material: 'cement-ppc',       month: '2025-12', price: 4237.29,  aipi: 114.18 },
  { region: 'delhi-ncr', material: 'steel-tmt',        month: '2025-12', price: 45760,    aipi: 101.39 },
  { region: 'delhi-ncr', material: 'steel-structural', month: '2025-12', price: 48410,    aipi: 116.57 },
  { region: 'delhi-ncr', material: 'diesel',           month: '2025-12', price: 87.62,    aipi: 186.62 },
];

/**
 * Pick the price that applies for a target month: the latest published month that is not
 * after it. CPWD publishes with a lag, so the month a bill needs may not be out — the base
 * price then holds until a newer circular lands, which is the honest rule. Returns null
 * when nothing on or before the target exists (target predates all data).
 *
 * Pure — no database — so the selection rule is tested on its own.
 */
export function selectPriceForMonth(
  rows: Array<{ month: string; price: number; aipi: number | null }>,
  targetMonth: string,
): { month: string; price: number; aipi: number | null } | null {
  let best: { month: string; price: number; aipi: number | null } | null = null;
  for (const row of rows) {
    if (row.month > targetMonth) continue;
    if (!best || row.month > best.month) best = { month: row.month, price: row.price, aipi: row.aipi };
  }
  return best;
}

/** Read every stored price for one region + material, oldest month first. */
async function pricesFor(region: string, material: CpwdMaterial): Promise<CpwdPriceRow[]> {
  const { schemaQualified } = await import('./db-schema');
  const table = await schemaQualified('cpwd_material_prices');
  const rows = await prisma.$queryRawUnsafe<Array<{ month: string; price: number; aipi: number | null }>>(
    `SELECT "month", "price", "aipi" FROM ${table}
     WHERE "region" = $1 AND "material" = $2 ORDER BY "month" ASC`,
    region, material,
  );
  return rows.map(r => ({ region, material, month: r.month, price: Number(r.price), aipi: r.aipi == null ? null : Number(r.aipi) }));
}

export interface Cpwd10caMaterialPrices {
  material: CpwdMaterial;
  basePrice: number | null;    // at the contract's tender-receipt month
  currentPrice: number | null; // at the bill month
  baseMonthUsed: string | null;
  currentMonthUsed: string | null;
}

/**
 * The base price (at the tender-receipt month) and current price (at the bill month) for
 * each requested 10CA material in a region, ready for the Engine B calculator. Missing
 * data yields nulls on that material rather than throwing, so one absent circular never
 * fails a whole bill.
 */
export async function getCpwd10caPrices(
  region: string,
  tenderMonth: string,
  billMonth: string,
  materials: CpwdMaterial[],
): Promise<Cpwd10caMaterialPrices[]> {
  return Promise.all(materials.map(async material => {
    const rows = await pricesFor(region, material);
    const base = selectPriceForMonth(rows, tenderMonth);
    const current = selectPriceForMonth(rows, billMonth);
    return {
      material,
      basePrice: base?.price ?? null,
      currentPrice: current?.price ?? null,
      baseMonthUsed: base?.month ?? null,
      currentMonthUsed: current?.month ?? null,
    };
  }));
}
