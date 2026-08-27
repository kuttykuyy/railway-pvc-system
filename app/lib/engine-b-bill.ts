import { prisma } from './db';
import { computeCpwd10ca } from './pvc-engine-b';
import { computeCpwd10cc, type Cpwd10ccResultLine } from './pvc-cpwd-10cc';
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
  contractId: string;
  /** Gross value of work done in this bill — the base 10CC's haircut applies to. */
  billAmount: number;
  dateOfMeasurement: Date;
  contract: { baseMonth: Date; completionPeriodMonths?: number | null };
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
  // 10CC columns, added to the same table (the CPWD bill result is 10CA + 10CC together).
  await prisma.$executeRawUnsafe(`ALTER TABLE "${s}"."cpwd_10ca_calculations"
    ADD COLUMN IF NOT EXISTS "cpwd10ccTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "cpwd10ccBreakdown" JSONB NOT NULL DEFAULT '[]',
    ADD COLUMN IF NOT EXISTS "combinedTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "cpwd10ccNote" TEXT`);
}

export interface EngineBBillResult {
  scheme: 'cpwd-10ca';
  billId: string;
  region: string | null;
  baseMonth: string;
  billMonth: string;
  totalVariation: number;
  breakdown: Array<ReturnType<typeof computeCpwd10ca>['lines'][number] & { baseMonthUsed: string | null; currentMonthUsed: string | null }>;
  flags: Array<{ code: string; reason: string }>;
  excluded: readonly string[];
  /** 10CC (labour/materials/POL) total; 0 when the contract has no Schedule-E config. */
  cpwd10ccTotal: number;
  cpwd10ccBreakdown: Array<Cpwd10ccResultLine & { baseMonthUsed: string | null; currentMonthUsed: string | null }>;
  /** 10CA + 10CC — the CPWD price variation for the bill. */
  combinedTotal: number;
  /** Why 10CC was skipped or its eligibility unverified, if applicable. */
  cpwd10ccNote: string | null;
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

  // Which month's circular each material's base/current price actually came from — so the
  // card can show it and warn when the feed fell back to a stale month.
  const monthsByMaterial = new Map(priceRows.map(p => [p.material, { baseMonthUsed: p.baseMonthUsed, currentMonthUsed: p.currentMonthUsed }]));
  const caBreakdown = result.lines.map(l => {
    const m = monthsByMaterial.get(l.material === 'cement' ? 'cement-opc' : (l.material as any));
    return { ...l, baseMonthUsed: m?.baseMonthUsed ?? null, currentMonthUsed: m?.currentMonthUsed ?? null };
  });

  // ── 10CC: labour + other materials + POL, on the WPI/CPI indices, with the 0.85 haircut.
  // Runs only when the contract carries Schedule-E percentages; otherwise it is 0 and the
  // CPWD total is 10CA alone. Real CPWD escalation is 10CA + 10CC added.
  let cpwd10ccTotal = 0;
  let cpwd10ccLines: Array<Cpwd10ccResultLine & { baseMonthUsed: string | null; currentMonthUsed: string | null }> = [];
  let cpwd10ccNote: string | null = null;
  try {
    const { readCpwd10ccSchedule } = await import('./pvc-scheme');
    const schedule = await readCpwd10ccSchedule(bill.contractId);
    if (schedule) {
      // Eligibility gate: 10CC applies only when completion exceeds the threshold.
      const { getAdminSetting } = await import('./admin-settings');
      const { cpwd10ccEligibility } = await import('./pvc-cpwd-10cc');
      const threshold = Number(await getAdminSetting('CPWD_10CC_THRESHOLD_MONTHS', 12)) || 12;
      const elig = cpwd10ccEligibility(bill.contract.completionPeriodMonths, threshold);
      cpwd10ccNote = elig.note;
      if (elig.eligible) {
        const { getCpwd10ccIndices } = await import('./cpwd-10cc-indices');
        const idx = await getCpwd10ccIndices(baseMonth, billMonth);
        const r10cc = computeCpwd10cc({
          workValue: Number(bill.billAmount) || 0,
          haircut: schedule.haircut,
          departmentalMaterial: schedule.departmentalMaterial,
          fixedChargeServices: schedule.fixedChargeServices,
          components: [
            { key: 'labour', percent: schedule.labour, baseIndex: idx.labour.base ?? 0, currentIndex: idx.labour.current ?? 0 },
            { key: 'materials', percent: schedule.materials, baseIndex: idx.materials.base ?? 0, currentIndex: idx.materials.current ?? 0 },
            { key: 'pol', percent: schedule.pol, baseIndex: idx.pol.base ?? 0, currentIndex: idx.pol.current ?? 0 },
          ],
        });
        cpwd10ccTotal = r10cc.totalVariation;
        cpwd10ccLines = r10cc.lines.map(l => ({
          ...l,
          baseMonthUsed: idx[l.key]?.baseMonthUsed ?? null,
          currentMonthUsed: idx[l.key]?.currentMonthUsed ?? null,
        }));
      }
      // Not eligible → 10CA only; cpwd10ccNote explains why on the card and statement.
    }
  } catch (error) {
    console.error('[engine-b] 10CC computation failed (10CA still stored):', error);
  }

  const combinedTotal = Math.round((result.totalVariation + cpwd10ccTotal) * 100) / 100;

  // Store in Engine B's own table (10CA + 10CC together).
  const s = await appSchema();
  try {
    await ensureResultTable(s);
    await prisma.$executeRawUnsafe(
      `INSERT INTO "${s}"."cpwd_10ca_calculations"
         ("billId","region","baseMonth","billMonth","totalVariation","breakdown","flags","excluded","cpwd10ccTotal","cpwd10ccBreakdown","combinedTotal","cpwd10ccNote")
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9,$10::jsonb,$11,$12)
       ON CONFLICT ("billId") DO UPDATE SET
         "region"=EXCLUDED."region","baseMonth"=EXCLUDED."baseMonth","billMonth"=EXCLUDED."billMonth",
         "totalVariation"=EXCLUDED."totalVariation","breakdown"=EXCLUDED."breakdown","flags"=EXCLUDED."flags",
         "excluded"=EXCLUDED."excluded","cpwd10ccTotal"=EXCLUDED."cpwd10ccTotal","cpwd10ccBreakdown"=EXCLUDED."cpwd10ccBreakdown",
         "combinedTotal"=EXCLUDED."combinedTotal","cpwd10ccNote"=EXCLUDED."cpwd10ccNote","updatedAt"=CURRENT_TIMESTAMP`,
      bill.id, region, baseMonth, billMonth, result.totalVariation,
      JSON.stringify(caBreakdown), JSON.stringify(tonnages.flags), JSON.stringify(result.excluded),
      cpwd10ccTotal, JSON.stringify(cpwd10ccLines), combinedTotal, cpwd10ccNote,
    );
  } catch (error) {
    console.error('[engine-b] could not store CPWD result:', error);
  }

  return {
    scheme: 'cpwd-10ca',
    billId: bill.id,
    region,
    baseMonth,
    billMonth,
    totalVariation: result.totalVariation,
    breakdown: caBreakdown,
    flags: tonnages.flags,
    excluded: result.excluded,
    cpwd10ccTotal,
    cpwd10ccBreakdown: cpwd10ccLines,
    combinedTotal,
    cpwd10ccNote,
  };
}
