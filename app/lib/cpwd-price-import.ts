import { prisma } from './db';
import type { CpwdPriceRow } from './cpwd-prices';

/**
 * Load CPWD 10CA prices into the feed — the shared write path used by both the admin
 * button and the scheduled auto-import. Idempotent: a month already present is updated in
 * place, so re-running only adds the months NSRCivil has newly published.
 */

async function appSchema(): Promise<string> {
  const { tableSchema } = await import('./db-schema');
  return tableSchema('contracts');
}

export async function ensureCpwdPriceTable(s: string): Promise<void> {
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "${s}"."cpwd_material_prices" (
    "region" TEXT NOT NULL,
    "material" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "aipi" DOUBLE PRECISION,
    "unit" TEXT NOT NULL DEFAULT 'MT',
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "cpwd_material_prices_pkey" PRIMARY KEY ("region", "material", "month")
  )`);
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "cpwd_material_prices_region_material_idx" ON "${s}"."cpwd_material_prices" ("region", "material")`,
  );
}

export async function upsertCpwdPriceRows(s: string, rows: CpwdPriceRow[]): Promise<number> {
  const { CPWD_MATERIAL_META } = await import('./cpwd-prices');
  let written = 0;
  for (const r of rows) {
    const unit = (CPWD_MATERIAL_META as any)[r.material]?.unit || 'MT';
    await prisma.$executeRawUnsafe(
      `INSERT INTO "${s}"."cpwd_material_prices" ("region","material","month","price","aipi","unit")
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT ("region","material","month") DO UPDATE SET
         "price" = EXCLUDED."price", "aipi" = EXCLUDED."aipi", "unit" = EXCLUDED."unit", "updatedAt" = CURRENT_TIMESTAMP`,
      r.region, r.material, r.month, r.price, r.aipi, unit,
    );
    written += 1;
  }
  return written;
}

export interface CpwdImportResult {
  written: number;
  months: number;
  latestMonth: string | null;
  newMonths: string[];
}

/** Fetch the latest NSRCivil 10CA history and upsert it, reporting which months are new. */
export async function importCpwd10caFromNsr(): Promise<CpwdImportResult> {
  const { fetchCpwd10caFromNsr } = await import('./cpwd-price-fetcher');
  const s = await appSchema();
  await ensureCpwdPriceTable(s);

  // Months already in the feed, to report only the genuinely new ones.
  const existing = await prisma.$queryRawUnsafe<Array<{ month: string }>>(
    `SELECT DISTINCT "month" FROM "${s}"."cpwd_material_prices"`,
  );
  const had = new Set(existing.map(e => e.month));

  const rows = await fetchCpwd10caFromNsr();
  const written = await upsertCpwdPriceRows(s, rows);

  const allMonths = Array.from(new Set(rows.map(r => r.month))).sort();
  const newMonths = allMonths.filter(m => !had.has(m));
  return {
    written,
    months: allMonths.length,
    latestMonth: allMonths[allMonths.length - 1] || null,
    newMonths,
  };
}
