import { prisma } from './db';
import { computeCpwd10ca } from './pvc-engine-b';
import {
  deriveTonnagesFromEntries, buildEngineBLines, normalizeItemCode,
  type EngineBEntry, type MaterialPricePair,
} from './engine-b-derive';
import { getCpwd10caPrices, type CpwdMaterial } from './cpwd-prices';

/**
 * Engine B for a whole bill — the CPWD 10CA path, reached only for a contract whose
 * pvcScheme is 'cpwd-10ca'. It derives the material tonnages from the bill's items, prices
 * them off the CPWD feed for the base (tender) and bill months, and stores the result in
 * its OWN raw-SQL table so the Railway PvcCalculation store stays untouched.
 *
 * v1 prices cement (OPC) and steel; diesel is disclosed as excluded (see pvc-engine-b).
 */

const yyyymm = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

interface BillForEngineB {
  id: string;
  dateOfMeasurement: Date;
  contract: { baseMonth: Date };
  classificationEntries: EngineBEntry[];
}

async function appSchema(): Promise<string> {
  const { tableSchema } = await import('./db-schema');
  return tableSchema('contracts');
}

/** Cement coefficient (MT per work unit) for every code, keyed the way entries are normalised. */
async function cementCoeffByCode(): Promise<Map<string, number>> {
  const rows = await prisma.dsrCementCoefficient.findMany({
    where: { isActive: true },
    select: { dsrCode: true, cementQuantityPerUnit: true },
  });
  return new Map(rows.map(r => [normalizeItemCode(r.dsrCode), Number(r.cementQuantityPerUnit)]));
}

/** Rate-book unit for a set of codes (steel needs it to convert to MT). Raw table. */
async function unitsByCode(codes: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (codes.length === 0) return map;
  try {
    const { schemaQualified } = await import('./db-schema');
    const table = await schemaQualified('dsr_items');
    const rows = await prisma.$queryRawUnsafe<Array<{ code: string; unit: string | null }>>(
      `SELECT DISTINCT "code", "unit" FROM ${table}`,
    );
    for (const r of rows) {
      const key = normalizeItemCode(r.code);
      if (!map.has(key) && r.unit) map.set(key, String(r.unit));
    }
  } catch {
    // No rate book loaded → steel units unresolved; those lines get flagged, not guessed.
  }
  return map;
}

async function ensureResultTable(s: string): Promise<void> {
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "${s}"."cpwd_10ca_calculations" (
    "billId" TEXT PRIMARY KEY,
    "region" TEXT,
    "baseMonth" TEXT,
    "billMonth" TEXT,
    "totalVariation" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "breakdown" JSONB NOT NULL DEFAULT '[]',
    "flags" JSONB NOT NULL DEFAULT '[]',
    "excluded" JSONB NOT NULL DEFAULT '[]',
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
}

export interface EngineBBillResult {
  scheme: 'cpwd-10ca';
  billId: string;
  region: string | null;
  baseMonth: string;
  billMonth: string;
  totalVariation: number;
  breakdown: ReturnType<typeof computeCpwd10ca>['lines'];
  flags: Array<{ code: string; reason: string }>;
  excluded: readonly string[];
}

export async function computeAndStoreEngineB(bill: BillForEngineB, region: string | null): Promise<EngineBBillResult> {
  const billMonth = yyyymm(new Date(bill.dateOfMeasurement));
  const baseMonth = yyyymm(new Date(bill.contract.baseMonth));

  const entries = bill.classificationEntries || [];
  const codes = Array.from(new Set(entries.flatMap(e => {
    const rows = Array.isArray(e.itemRows) ? (e.itemRows as any[]) : [];
    const list = rows.length > 0 ? rows.map(r => r?.itemNumber) : [e.itemNumber];
    return list.map(normalizeItemCode).filter(Boolean);
  })));

  const [cementCoeff, units] = await Promise.all([cementCoeffByCode(), unitsByCode(codes)]);
  const tonnages = deriveTonnagesFromEntries(entries, cementCoeff, units);

  // Prices for the materials v1 prices; region null → no data, everything comes back null
  // and the lines are skipped (a total of 0, honestly reported, not a wrong number).
  const wanted: CpwdMaterial[] = ['cement-opc', 'steel-tmt', 'steel-structural'];
  const priceRows = region
    ? await getCpwd10caPrices(region, baseMonth, billMonth, wanted)
    : wanted.map(material => ({ material, basePrice: null, currentPrice: null, baseMonthUsed: null, currentMonthUsed: null }));
  const prices: Record<string, MaterialPricePair> = {};
  for (const p of priceRows) prices[p.material] = { basePrice: p.basePrice, currentPrice: p.currentPrice };

  const lines = buildEngineBLines(tonnages, prices as any);
  const result = computeCpwd10ca(lines);

  // Store in Engine B's own table.
  const s = await appSchema();
  try {
    await ensureResultTable(s);
    await prisma.$executeRawUnsafe(
      `INSERT INTO "${s}"."cpwd_10ca_calculations" ("billId","region","baseMonth","billMonth","totalVariation","breakdown","flags","excluded")
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb)
       ON CONFLICT ("billId") DO UPDATE SET
         "region"=EXCLUDED."region","baseMonth"=EXCLUDED."baseMonth","billMonth"=EXCLUDED."billMonth",
         "totalVariation"=EXCLUDED."totalVariation","breakdown"=EXCLUDED."breakdown","flags"=EXCLUDED."flags",
         "excluded"=EXCLUDED."excluded","updatedAt"=CURRENT_TIMESTAMP`,
      bill.id, region, baseMonth, billMonth, result.totalVariation,
      JSON.stringify(result.lines), JSON.stringify(tonnages.flags), JSON.stringify(result.excluded),
    );
  } catch (error) {
    console.error('[engine-b] could not store CPWD 10CA result:', error);
  }

  return {
    scheme: 'cpwd-10ca',
    billId: bill.id,
    region,
    baseMonth,
    billMonth,
    totalVariation: result.totalVariation,
    breakdown: result.lines,
    flags: tonnages.flags,
    excluded: result.excluded,
  };
}
