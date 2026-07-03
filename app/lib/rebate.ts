/**
 * Rebate handling for IREPS bills.
 *
 * When a contractor is awarded work below the estimated cost, the IREPS bill's
 * Schedule Summary shows a "Rebate(xx.xx%)" row: the gross "Total Amount(Rs.)"
 * is reduced by the rebate to give the final "Bill Amount (Rs.) (Including Tax
 * (GST))". That final (net) figure is the amount actually payable, so it is the
 * value the app must use for bill upload and PVC.
 *
 * Because PVC is computed per work component, every component amount is scaled
 * down by the same rebate factor so the components sum to the net Bill Amount
 * and PVC is calculated on the post-rebate work value.
 */

export interface RebateInputs {
  /** Gross "Total Amount(Rs.)" from the Schedule Summary (before rebate). */
  grossTotal?: number | null;
  /** Net "Bill Amount (Rs.) (Including Tax (GST))" (after rebate). */
  netBillAmount?: number | null;
  /** Rebate percentage from the "Rebate(xx.xx%)" label, e.g. 30.01. */
  rebatePercentage?: number | null;
}

const EPSILON = 1e-9;

/**
 * The multiplier to apply to each gross component so the components sum to the
 * net Bill Amount. Prefers the exact net/gross ratio (matches the printed net
 * to the paise); falls back to (1 - rebate%/100) when only the percentage is
 * known. Returns 1 (no change) when there is no rebate or inputs are unusable.
 */
export function computeRebateFactor(input: RebateInputs): number {
  const gross = toPositive(input.grossTotal);
  const net = toPositive(input.netBillAmount);
  if (gross !== undefined && net !== undefined && net < gross) {
    return net / gross;
  }
  const pct = input.rebatePercentage;
  if (typeof pct === 'number' && Number.isFinite(pct) && pct > 0 && pct < 100) {
    return 1 - pct / 100;
  }
  return 1;
}

/** True when a rebate materially reduces the bill (factor below 1). */
export function hasRebate(input: RebateInputs): boolean {
  return computeRebateFactor(input) < 1 - EPSILON;
}

/** Scales one component amount by the rebate factor, rounded to paise. */
export function scaleComponentAmount(amount: number, factor: number): number {
  if (!Number.isFinite(amount)) return amount;
  return Math.round(amount * factor * 100) / 100;
}

/**
 * Scales a list of component amounts by the rebate factor so their rounded sum
 * ties exactly to the rounded scaled total (no per-item rounding drift). Any
 * leftover paise is absorbed into the largest component. Returns the amounts
 * unchanged when there is no rebate (factor >= 1).
 */
export function scaleComponentsWithRebate(amounts: number[], factor: number): number[] {
  if (factor >= 1) return amounts.slice();
  const scaled = amounts.map(amount => scaleComponentAmount(amount, factor));
  const grossSum = amounts.reduce((sum, amount) => sum + (Number.isFinite(amount) ? amount : 0), 0);
  const target = Math.round(grossSum * factor * 100) / 100;
  const currentSum = Math.round(scaled.reduce((sum, amount) => sum + (Number.isFinite(amount) ? amount : 0), 0) * 100) / 100;
  const remainder = Math.round((target - currentSum) * 100) / 100;
  if (remainder !== 0) {
    let maxIndex = -1;
    for (let i = 0; i < scaled.length; i++) {
      if (Number.isFinite(scaled[i]) && (maxIndex < 0 || scaled[i] > scaled[maxIndex])) maxIndex = i;
    }
    if (maxIndex >= 0) scaled[maxIndex] = Math.round((scaled[maxIndex] + remainder) * 100) / 100;
  }
  return scaled;
}

function toPositive(value: number | null | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}
