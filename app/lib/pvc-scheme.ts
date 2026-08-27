/**
 * Which price-variation scheme a contract is priced under — the fork that lets more than
 * one calculation engine live in the app without entangling them.
 *
 * Today there is exactly one engine: the Railway Clause 46A index-ratio model (component%
 * × value × (In − I0)/I0), including its pre-2022 variant. Everything the app has ever
 * computed is that engine, and this module leaves it exactly as it is: every contract
 * resolves to `railway-46a`, so the dispatcher routes 100% of work down the existing path.
 *
 * The point of introducing the seam now, before any second engine exists, is that adding
 * one later (CPWD 10CA is the star-rate/quantity "Engine B": V = Σ Q × (Pnow − Pbase)) is
 * then a new branch, not a rewrite of the working Railway path. See the expansion notes.
 *
 * No database column is declared for this yet — per the house rule, a schema.prisma field
 * is never added ahead of the live DB having the column. `resolvePvcScheme` reads the
 * field only if a contract object happens to carry it and otherwise defaults, so this is a
 * pure no-op until the column is deliberately added in a later phase.
 */

/** The engines the app knows about. Only `railway-46a` is implemented today. */
export type PvcScheme = 'railway-46a' | 'cpwd-10ca';

export const DEFAULT_PVC_SCHEME: PvcScheme = 'railway-46a';

/** Schemes with a working calculation engine behind them right now. */
const IMPLEMENTED_SCHEMES: ReadonlySet<PvcScheme> = new Set<PvcScheme>(['railway-46a', 'cpwd-10ca']);

const KNOWN_SCHEMES: ReadonlySet<string> = new Set<PvcScheme>(['railway-46a', 'cpwd-10ca']);

/**
 * The scheme a contract is priced under. Reads `contract.pvcScheme` when present, falling
 * back to the Railway engine — which is every contract until the column and the second
 * engine are added. An unrecognised stored value also falls back rather than throwing:
 * the fork must never turn a real Railway bill into an error.
 */
export function resolvePvcScheme(contract: { pvcScheme?: string | null } | null | undefined): PvcScheme {
  const raw = contract && typeof (contract as any).pvcScheme === 'string'
    ? String((contract as any).pvcScheme).trim()
    : '';
  if (raw && KNOWN_SCHEMES.has(raw)) return raw as PvcScheme;
  return DEFAULT_PVC_SCHEME;
}

/** True for the Railway Clause 46A engine — the one path the whole app runs on today. */
export function isRailwayScheme(scheme: PvcScheme): boolean {
  return scheme === 'railway-46a';
}

/**
 * Guard at the mouth of the calculation. Passes for an implemented engine and throws a
 * clear error for one that is declared but not yet built, so a half-configured second
 * scheme fails loudly here instead of silently borrowing the Railway maths.
 */
export function assertSchemeImplemented(scheme: PvcScheme): void {
  if (!IMPLEMENTED_SCHEMES.has(scheme)) {
    throw new Error(
      `PVC scheme "${scheme}" is selected on this contract but its calculation engine is not built yet. `
      + 'Only the Railway Clause 46A engine is available at present.',
    );
  }
}

/**
 * The scheme (and CPWD region) a contract is on, read straight from the database.
 *
 * `pvcScheme` and `cpwdRegion` are deliberately NOT declared in schema.prisma — a Prisma
 * model load never selects them — so they are read here with a small raw query that
 * tolerates the columns not existing yet (before the pending DDL is applied) by falling
 * back to the Railway engine. That keeps the two engines from entangling and means no
 * window where schema.prisma knows a column the live DB does not.
 */
export async function readContractScheme(contractId: string): Promise<{ scheme: PvcScheme; region: string | null }> {
  try {
    const { prisma } = await import('./db');
    const { schemaQualified } = await import('./db-schema');
    const table = await schemaQualified('contracts');
    const rows = await prisma.$queryRawUnsafe<Array<{ pvcScheme: string | null; cpwdRegion: string | null }>>(
      `SELECT "pvcScheme", "cpwdRegion" FROM ${table} WHERE "id" = $1 LIMIT 1`,
      contractId,
    );
    const row = rows[0];
    return {
      scheme: resolvePvcScheme({ pvcScheme: row?.pvcScheme }),
      region: row?.cpwdRegion ? String(row.cpwdRegion).trim().toLowerCase() : null,
    };
  } catch {
    // Columns not applied yet, or any read error → the Railway engine, which is every
    // contract until CPWD is switched on. Never let this fork break a real bill.
    return { scheme: DEFAULT_PVC_SCHEME, region: null };
  }
}

/**
 * Persist a contract's scheme and CPWD region via raw SQL (the columns are not in the
 * Prisma model). Region is only meaningful for CPWD; it is cleared for Railway. Silently
 * does nothing if the columns are not applied yet, so saving a contract never fails on it.
 */
export async function writeContractScheme(contractId: string, scheme: PvcScheme, region: string | null): Promise<void> {
  try {
    const { prisma } = await import('./db');
    const { schemaQualified } = await import('./db-schema');
    const table = await schemaQualified('contracts');
    const cleanRegion = scheme === 'cpwd-10ca' && region ? String(region).trim().toLowerCase() : null;
    await prisma.$executeRawUnsafe(
      `UPDATE ${table} SET "pvcScheme" = $1, "cpwdRegion" = $2 WHERE "id" = $3`,
      scheme, cleanRegion, contractId,
    );
  } catch (error) {
    console.error('[pvc-scheme] could not persist scheme (columns applied?):', error);
  }
}

/** Clause 10CC's per-contract Schedule-E percentages and optional overrides. */
export interface Cpwd10ccSchedule {
  labour: number;
  materials: number;
  pol: number;
  /** Non-escalable fraction; W = haircut × work value. Defaults to 0.85 downstream. */
  haircut?: number;
  /** K — departmental (free-issue) material value excluded from the escalable base. */
  departmentalMaterial?: number;
  /** L — fixed-charge services value excluded from the escalable base. */
  fixedChargeServices?: number;
}

/**
 * Build a 10CC schedule from three raw percentage inputs. Returns null when none is a
 * usable number, so a CPWD contract without Schedule-E percentages simply prices 10CA.
 * Each percent is clamped to 0–100; a missing one is treated as 0.
 */
export function buildCpwd10ccSchedule(labour: unknown, materials: unknown, pol: unknown): Cpwd10ccSchedule | null {
  const num = (v: unknown): number | null => {
    if (v === '' || v === null || v === undefined) return null;
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : null;
  };
  const l = num(labour), m = num(materials), p = num(pol);
  if (l === null && m === null && p === null) return null;
  return { labour: l ?? 0, materials: m ?? 0, pol: p ?? 0 };
}

/** Read the 10CC Schedule-E config for a contract, or null if none / columns not applied. */
export async function readCpwd10ccSchedule(contractId: string): Promise<Cpwd10ccSchedule | null> {
  try {
    const { prisma } = await import('./db');
    const { schemaQualified } = await import('./db-schema');
    const table = await schemaQualified('contracts');
    const rows = await prisma.$queryRawUnsafe<Array<{ cpwd10ccSchedule: any }>>(
      `SELECT "cpwd10ccSchedule" FROM ${table} WHERE "id" = $1 LIMIT 1`,
      contractId,
    );
    const raw = rows[0]?.cpwd10ccSchedule;
    if (!raw) return null;
    const s = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (s && typeof s === 'object' && ['labour', 'materials', 'pol'].every(k => typeof s[k] === 'number')) {
      return s as Cpwd10ccSchedule;
    }
    return null;
  } catch {
    return null;
  }
}

/** Persist the 10CC Schedule-E config (or clear it) via raw SQL. */
export async function writeCpwd10ccSchedule(contractId: string, schedule: Cpwd10ccSchedule | null): Promise<void> {
  try {
    const { prisma } = await import('./db');
    const { schemaQualified } = await import('./db-schema');
    const table = await schemaQualified('contracts');
    await prisma.$executeRawUnsafe(
      `UPDATE ${table} SET "cpwd10ccSchedule" = $1::jsonb WHERE "id" = $2`,
      schedule ? JSON.stringify(schedule) : null, contractId,
    );
  } catch (error) {
    console.error('[pvc-scheme] could not persist 10CC schedule (columns applied?):', error);
  }
}
