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
const IMPLEMENTED_SCHEMES: ReadonlySet<PvcScheme> = new Set<PvcScheme>(['railway-46a']);

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
