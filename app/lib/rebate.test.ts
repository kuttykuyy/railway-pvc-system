import { describe, it, expect } from 'vitest';
import { computeRebateFactor, hasRebate, scaleComponentAmount, scaleComponentsWithRebate } from './rebate';

describe('computeRebateFactor', () => {
  it('uses the exact net/gross ratio when both amounts are present', () => {
    // Real bill: Total 18453200, Rebate 30.01% -> Bill Amount 12915394.68.
    const factor = computeRebateFactor({ grossTotal: 18453200, netBillAmount: 12915394.68, rebatePercentage: 30.01 });
    expect(factor).toBeCloseTo(12915394.68 / 18453200, 10);
    // Scaling the gross total back down must reproduce the printed net to the paise.
    expect(scaleComponentAmount(18453200, factor)).toBeCloseTo(12915394.68, 2);
  });

  it('falls back to (1 - rebate%/100) when only the percentage is known', () => {
    expect(computeRebateFactor({ rebatePercentage: 30.01 })).toBeCloseTo(0.6999, 10);
  });

  it('returns 1 when there is no rebate', () => {
    expect(computeRebateFactor({ grossTotal: 1000, netBillAmount: 1000, rebatePercentage: 0 })).toBe(1);
    expect(computeRebateFactor({})).toBe(1);
  });

  it('ignores a net that is not below gross (no negative or inflating rebate)', () => {
    expect(computeRebateFactor({ grossTotal: 1000, netBillAmount: 1200 })).toBe(1);
  });

  it('ignores out-of-range percentages', () => {
    expect(computeRebateFactor({ rebatePercentage: 0 })).toBe(1);
    expect(computeRebateFactor({ rebatePercentage: 100 })).toBe(1);
    expect(computeRebateFactor({ rebatePercentage: -5 })).toBe(1);
  });
});

describe('hasRebate', () => {
  it('detects a real rebate and no-rebate bills', () => {
    expect(hasRebate({ grossTotal: 18453200, netBillAmount: 12915394.68 })).toBe(true);
    expect(hasRebate({ grossTotal: 1000, netBillAmount: 1000 })).toBe(false);
    expect(hasRebate({})).toBe(false);
  });
});

describe('scaleComponentAmount', () => {
  it('scales and rounds each component to paise', () => {
    const factor = computeRebateFactor({ grossTotal: 18453200, netBillAmount: 12915394.68 });
    // Two components that sum to the gross total scale to (about) the net total.
    const a = scaleComponentAmount(10000000, factor);
    const b = scaleComponentAmount(8453200, factor);
    expect(a + b).toBeCloseTo(12915394.68, 1);
  });

  it('leaves amounts unchanged when the factor is 1', () => {
    expect(scaleComponentAmount(1234.56, 1)).toBe(1234.56);
  });
});

describe('scaleComponentsWithRebate', () => {
  const round2 = (n: number) => Math.round(n * 100) / 100;

  it('ties the scaled components exactly to the rounded scaled total', () => {
    const factor = computeRebateFactor({ grossTotal: 18453200, netBillAmount: 12915394.68 });
    // 23 equal components summing to the gross total — the case that drifted by a paise.
    const amounts = Array.from({ length: 23 }, () => 18453200 / 23);
    const scaled = scaleComponentsWithRebate(amounts, factor);
    const sum = round2(scaled.reduce((s, a) => s + a, 0));
    expect(sum).toBe(round2(18453200 * factor)); // 12915394.68, no 1-paise drift
  });

  it('returns amounts unchanged when there is no rebate', () => {
    const amounts = [100.11, 200.22, 300.33];
    expect(scaleComponentsWithRebate(amounts, 1)).toEqual(amounts);
  });

  it('absorbs the remainder into the largest component only', () => {
    const factor = computeRebateFactor({ grossTotal: 1000, netBillAmount: 699.9 });
    const amounts = [333.33, 333.33, 333.34];
    const scaled = scaleComponentsWithRebate(amounts, factor);
    const sum = round2(scaled.reduce((s, a) => s + a, 0));
    expect(sum).toBe(round2(1000 * factor));
  });
});
