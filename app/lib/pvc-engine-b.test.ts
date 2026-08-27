import { describe, expect, it } from 'vitest';
import {
  computeCpwd10ca, cpwd10caLineFromIndex, deriveCementQuantity,
  CPWD_10CA_EXCLUDED_IN_V1,
} from './pvc-engine-b';

describe('computeCpwd10ca', () => {
  it('prices each material as quantity x price movement, and totals them', () => {
    const r = computeCpwd10ca([
      { material: 'cement', quantity: 50, unit: 'MT', basePrice: 3978, currentPrice: 4915.25 },
      { material: 'steel-tmt', quantity: 20, unit: 'MT', basePrice: 45133, currentPrice: 45760 },
    ]);
    // cement: 50 × (4915.25 − 3978) = 50 × 937.25 = 46,862.50
    // steel:  20 × (45760 − 45133) = 20 × 627 = 12,540.00
    expect(r.lines[0].variation).toBe(46862.5);
    expect(r.lines[1].variation).toBe(12540);
    expect(r.totalVariation).toBe(59402.5);
  });

  it('goes negative when a price has fallen — 10CA recovers from the contractor too', () => {
    const r = computeCpwd10ca([
      { material: 'steel-structural', quantity: 10, unit: 'MT', basePrice: 50000, currentPrice: 48410 },
    ]);
    expect(r.lines[0].variation).toBe(-15900); // 10 × (48410 − 50000)
    expect(r.totalVariation).toBe(-15900);
  });

  it('always discloses diesel as not priced in v1', () => {
    const r = computeCpwd10ca([]);
    expect(r.totalVariation).toBe(0);
    expect(r.excluded).toEqual(CPWD_10CA_EXCLUDED_IN_V1);
    expect(r.excluded).toContain('Diesel (POL)');
  });

  it('treats a missing/bad quantity or price as a zero line, without throwing', () => {
    const r = computeCpwd10ca([
      { material: 'cement', quantity: NaN, unit: 'MT', basePrice: 3978, currentPrice: 4915 },
      { material: 'steel-tmt', quantity: 20, unit: 'MT', basePrice: NaN as any, currentPrice: 45760 },
    ]);
    expect(r.lines[0].variation).toBe(0);
    expect(r.lines[1].variation).toBe(0);
    expect(r.totalVariation).toBe(0);
  });

  it('carries the human label for the statement', () => {
    const r = computeCpwd10ca([{ material: 'cement', quantity: 1, unit: 'MT', basePrice: 100, currentPrice: 110 }]);
    expect(r.lines[0].label).toBe('Cement');
  });
});

describe('cpwd10caLineFromIndex', () => {
  it('matches the price form: V = P x Q x (CI - CI0)/CI0', () => {
    // P = 3978 (Schedule F), CI0 = 100 (Oct-2012 base at tender), CI = 123.56 (bill month)
    const line = cpwd10caLineFromIndex({
      material: 'cement', quantity: 50, unit: 'MT',
      scheduleFBasePrice: 3978, baseIndex: 100, currentIndex: 123.56,
    });
    const r = computeCpwd10ca([line]);
    // currentPrice = 3978 × 1.2356 = 4915.2168 → V = 50 × (4915.2168 − 3978) = 46,860.84
    expect(r.lines[0].variation).toBeCloseTo(50 * 3978 * (123.56 - 100) / 100, 2);
  });

  it('is a no-op ratio when the base index is missing, so it cannot divide by zero', () => {
    const line = cpwd10caLineFromIndex({
      material: 'steel-tmt', quantity: 5, unit: 'MT',
      scheduleFBasePrice: 45000, baseIndex: 0, currentIndex: 110,
    });
    expect(line.currentPrice).toBe(45000); // ratio forced to 1
  });
});

describe('deriveCementQuantity', () => {
  it('sums cement coefficient x work quantity across the bill\'s concrete items', () => {
    // 0.4 MT/Cum × 100 Cum + 0.35 MT/Cum × 40 Cum = 40 + 14 = 54 MT
    const qty = deriveCementQuantity([
      { cementQuantityPerUnit: 0.4, workQuantity: 100 },
      { cementQuantityPerUnit: 0.35, workQuantity: 40 },
    ]);
    expect(qty).toBe(54);
  });

  it('skips items with a bad coefficient or quantity', () => {
    const qty = deriveCementQuantity([
      { cementQuantityPerUnit: 0.4, workQuantity: 100 },
      { cementQuantityPerUnit: NaN, workQuantity: 40 },
      { cementQuantityPerUnit: 0.3, workQuantity: -5 },
    ]);
    expect(qty).toBe(40);
  });
});
