/**
 * Engine B — the star-rate / actual-quantity price-variation model, for CPWD Clause 10CA.
 *
 * Unlike the Railway index-ratio engine (component% of the bill value × an index ratio),
 * 10CA pays on the ACTUAL material used: for each major material the variation is the
 * quantity consumed times how much its price moved since the tender.
 *
 *     V = Σ  Qₘ × (Priceₘ,now − Priceₘ,base)
 *
 * which is CPWD's published form  V = P × Q × (CI − CI₀)/CI₀  rewritten in prices, since
 * the current price is just the base price scaled by the index ratio (P × CI/CI₀).
 *
 * This file is the PURE maths only — no database, no bill loading, no Railway code. It is
 * fed already-resolved lines and returns the variation, so it is fully testable on its own.
 * How each quantity is obtained lives elsewhere (see the notes below), and this engine is
 * only ever reached for a contract whose pvcScheme routes here — the Railway path never
 * enters it.
 *
 * v1 scope: CEMENT and STEEL. Diesel (POL) is deliberately left out — it is neither a
 * measured item nor derivable from a cement-style coefficient, and inventing a litres
 * figure would put an unverifiable number into a bill. It is disclosed, not guessed.
 */

/** The 10CA materials this engine prices in v1. Diesel is intentionally absent. */
export type Cpwd10caMaterial = 'cement' | 'steel-tmt' | 'steel-structural';

/** Human labels for the statement. */
export const CPWD_10CA_MATERIAL_LABELS: Record<Cpwd10caMaterial, string> = {
  'cement': 'Cement',
  'steel-tmt': 'Reinforcement steel (TMT)',
  'steel-structural': 'Structural steel',
};

/** Materials 10CA covers that v1 does not price, named so the statement can disclose them. */
export const CPWD_10CA_EXCLUDED_IN_V1 = ['Diesel (POL)'] as const;

export interface Cpwd10caLine {
  material: Cpwd10caMaterial;
  /** Physical quantity consumed since the last bill, in `unit` (e.g. MT). */
  quantity: number;
  /** The unit `quantity` and the prices are expressed in (e.g. "MT"). */
  unit: string;
  /** Price per unit at the contract's tender-receipt date (Schedule F base price). */
  basePrice: number;
  /** Price per unit for this bill's month (from the CPWD monthly circular). */
  currentPrice: number;
}

export interface Cpwd10caResultLine extends Cpwd10caLine {
  label: string;
  /** currentPrice − basePrice, per unit. */
  priceDelta: number;
  /** quantity × priceDelta — the escalation (or recovery, if negative) for this material. */
  variation: number;
}

export interface Cpwd10caResult {
  lines: Cpwd10caResultLine[];
  /** Sum of every line's variation. Can be negative when prices have fallen. */
  totalVariation: number;
  /** What 10CA covers but this engine did not price, for the statement to disclose. */
  excluded: readonly string[];
}

/** Round to paise, the way money is compared elsewhere in the app. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

const isFinitePositive = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0;

/**
 * Compute the 10CA variation from resolved material lines.
 *
 * A line with a non-finite or negative quantity/price is treated as zero for that line
 * rather than throwing — a missing base price should not blow up a whole bill — but the
 * line is still returned so the caller can see it contributed nothing.
 */
export function computeCpwd10ca(lines: Cpwd10caLine[]): Cpwd10caResult {
  const resultLines: Cpwd10caResultLine[] = lines.map(line => {
    const usable = isFinitePositive(line.quantity)
      && Number.isFinite(line.basePrice)
      && Number.isFinite(line.currentPrice);
    const priceDelta = usable ? round2(line.currentPrice - line.basePrice) : 0;
    const variation = usable ? round2(line.quantity * (line.currentPrice - line.basePrice)) : 0;
    return {
      ...line,
      label: CPWD_10CA_MATERIAL_LABELS[line.material],
      priceDelta,
      variation,
    };
  });

  const totalVariation = round2(resultLines.reduce((sum, l) => sum + l.variation, 0));

  return {
    lines: resultLines,
    totalVariation,
    excluded: CPWD_10CA_EXCLUDED_IN_V1,
  };
}

/**
 * The same variation from CPWD's index form, when a line is given as a Schedule-F base
 * price and the two AIPI values (base = tender-receipt month, current = bill month, both
 * relative to Oct-2012 = 100) instead of two prices. Returns V = P × Q × (CI − CI₀)/CI₀.
 * Provided so the ingestion layer can feed whichever the circular publishes.
 */
export function cpwd10caLineFromIndex(args: {
  material: Cpwd10caMaterial;
  quantity: number;
  unit: string;
  scheduleFBasePrice: number;   // P — price at tender-receipt date
  baseIndex: number;            // CI₀ — AIPI at tender-receipt month
  currentIndex: number;         // CI — AIPI at bill month
}): Cpwd10caLine {
  const ratio = args.baseIndex > 0 ? args.currentIndex / args.baseIndex : 1;
  return {
    material: args.material,
    quantity: args.quantity,
    unit: args.unit,
    basePrice: args.scheduleFBasePrice,
    currentPrice: args.scheduleFBasePrice * ratio,
  };
}

/**
 * Cement quantity consumed since the last bill = Σ over the bill's concrete items of
 * (cement quantity per work unit × work quantity executed this bill). This is the
 * "coefficient × work quantity" derivation, reusing the same DsrCementCoefficient data
 * the Railway cement path already relies on. Steel is not derived this way — on the bill
 * it is a measured item, so its quantity is read directly.
 */
export function deriveCementQuantity(items: Array<{ cementQuantityPerUnit: number; workQuantity: number }>): number {
  const total = items.reduce((sum, it) => {
    if (!isFinitePositive(it.cementQuantityPerUnit) || !isFinitePositive(it.workQuantity)) return sum;
    return sum + it.cementQuantityPerUnit * it.workQuantity;
  }, 0);
  return round2(total);
}
