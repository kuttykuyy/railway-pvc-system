/**
 * CPWD Clause 10CC — price variation on labour, other materials and POL.
 *
 * The other half of CPWD escalation (10CA prices the major materials on actual price
 * movement; the two are computed independently and added). 10CC is an index-ratio model,
 * structurally the Railway engine's shape, with two differences:
 *
 *   1. A built-in 15% haircut: only 85% of the work value escalates. N = 0.85 × M, then
 *      the escalable base W = N − (K + L), where K is departmental-issued material and L is
 *      fixed-charge services (both excluded from escalation).
 *   2. The component percentages come from the contract's Schedule E (per tender), and the
 *      base index is the value at the last stipulated tender-receipt date — not a quarter.
 *
 *   Per component:  V = W × (pct/100) × (I_now − I_base) / I_base
 *
 * Pure maths only — no DB, no Railway code. Percentages, indices and the deductions are
 * fed in (Schedule E and the WPI/CPI feed supply them), so the calculation is fully
 * testable and independent of the CPWD GCC-2020 threshold, which gates eligibility
 * elsewhere, not the arithmetic here.
 */

export type Cpwd10ccComponentKey = 'labour' | 'materials' | 'pol';

export const CPWD_10CC_LABELS: Record<Cpwd10ccComponentKey, string> = {
  labour: 'Labour',
  materials: 'Other materials',
  pol: 'POL (fuel & lubricants)',
};

/** The 15% that never escalates (overhead + profit): W is 85% of the work value. */
export const CPWD_10CC_DEFAULT_HAIRCUT = 0.85;

export interface Cpwd10ccComponent {
  key: Cpwd10ccComponentKey;
  /** Xm / Y / Z from Schedule E — this component's percent of the work value. */
  percent: number;
  /** Index at the last stipulated tender-receipt date (I_base / subscript o). */
  baseIndex: number;
  /** Index for this bill's period (I_now). */
  currentIndex: number;
}

export interface Cpwd10ccInput {
  /** M — the gross value of work done in this bill. */
  workValue: number;
  /** The non-escalable fraction; W = haircut × workValue − deductions. Defaults to 0.85. */
  haircut?: number;
  /** K — departmental (free-issue) material value, excluded from the escalable base. */
  departmentalMaterial?: number;
  /** L — fixed-charge services value, excluded from the escalable base. */
  fixedChargeServices?: number;
  components: Cpwd10ccComponent[];
}

export interface Cpwd10ccResultLine {
  key: Cpwd10ccComponentKey;
  label: string;
  percent: number;
  baseIndex: number;
  currentIndex: number;
  /** (I_now − I_base) / I_base, as a fraction. */
  indexRatio: number;
  /** W × (pct/100) × indexRatio. Negative when the index has fallen. */
  variation: number;
}

export interface Cpwd10ccResult {
  /** M × haircut. */
  base85: number;
  /** W = base85 − (K + L), floored at 0. The value each component's percent applies to. */
  escalableBase: number;
  haircut: number;
  lines: Cpwd10ccResultLine[];
  totalVariation: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

/**
 * Whether 10CC applies: the contract's stipulated completion period must EXCEED the
 * threshold (default 12 months). A contract at or below gets 10CA only. When the period is
 * unknown, it is not gated out — 10CC runs but the note says eligibility was not verified,
 * so the figure is never silently dropped or silently allowed.
 */
export function cpwd10ccEligibility(
  completionMonths: number | null | undefined,
  thresholdMonths: number,
): { eligible: boolean; note: string | null } {
  if (!finite(completionMonths)) {
    return { eligible: true, note: `10CC eligibility not verified — the contract's completion period is not set (threshold is over ${thresholdMonths} months).` };
  }
  if (completionMonths > thresholdMonths) {
    return { eligible: true, note: null };
  }
  return {
    eligible: false,
    note: `10CC not applicable: the ${completionMonths}-month completion period does not exceed the ${thresholdMonths}-month threshold. Only 10CA materials are priced.`,
  };
}

/**
 * Compute the 10CC variation. A component with a non-positive base index (so its ratio is
 * undefined) contributes zero rather than throwing — a missing base index must not blow up
 * a bill — but the line is still returned so the gap is visible.
 */
export function computeCpwd10cc(input: Cpwd10ccInput): Cpwd10ccResult {
  const haircut = finite(input.haircut) ? input.haircut : CPWD_10CC_DEFAULT_HAIRCUT;
  const workValue = finite(input.workValue) ? input.workValue : 0;
  const K = finite(input.departmentalMaterial) ? input.departmentalMaterial : 0;
  const L = finite(input.fixedChargeServices) ? input.fixedChargeServices : 0;

  const base85 = round2(workValue * haircut);
  const escalableBase = Math.max(0, round2(base85 - (K + L)));

  const lines: Cpwd10ccResultLine[] = input.components.map(c => {
    const usable = finite(c.percent) && finite(c.baseIndex) && c.baseIndex > 0 && finite(c.currentIndex);
    const indexRatio = usable ? (c.currentIndex - c.baseIndex) / c.baseIndex : 0;
    const variation = usable ? round2(escalableBase * (c.percent / 100) * indexRatio) : 0;
    return {
      key: c.key,
      label: CPWD_10CC_LABELS[c.key],
      percent: c.percent,
      baseIndex: c.baseIndex,
      currentIndex: c.currentIndex,
      indexRatio: usable ? Math.round(indexRatio * 1e6) / 1e6 : 0,
      variation,
    };
  });

  const totalVariation = round2(lines.reduce((s, l) => s + l.variation, 0));
  return { base85, escalableBase, haircut, lines, totalVariation };
}
