import { describe, expect, it } from 'vitest';
import { selectPriceForMonth, CPWD_SEED_ROWS } from './cpwd-prices';

describe('selectPriceForMonth', () => {
  const rows = [
    { month: '2012-10', price: 3978, aipi: 100 },
    { month: '2025-06', price: 4800, aipi: 120 },
    { month: '2025-12', price: 4915.25, aipi: 123.56 },
  ];

  it('takes the exact month when it exists', () => {
    expect(selectPriceForMonth(rows, '2025-12')?.price).toBe(4915.25);
  });

  it('holds the latest earlier price when the target month is not published yet', () => {
    // A bill for Aug 2026, latest circular Dec 2025 → Dec 2025 price holds.
    expect(selectPriceForMonth(rows, '2026-08')?.month).toBe('2025-12');
  });

  it('falls back to the base when only the base predates the target', () => {
    expect(selectPriceForMonth(rows, '2013-01')?.price).toBe(3978);
  });

  it('returns null when the target predates all data', () => {
    expect(selectPriceForMonth(rows, '2012-09')).toBeNull();
  });

  it('is unaffected by row order', () => {
    const shuffled = [rows[2], rows[0], rows[1]];
    expect(selectPriceForMonth(shuffled, '2025-07')?.month).toBe('2025-06');
  });
});

describe('CPWD_SEED_ROWS', () => {
  it('carries the Oct-2012 base at AIPI 100 and a recent month for every material', () => {
    const materials = new Set(CPWD_SEED_ROWS.map(r => r.material));
    for (const m of materials) {
      const forM = CPWD_SEED_ROWS.filter(r => r.material === m);
      expect(forM.some(r => r.month === '2012-10' && r.aipi === 100)).toBe(true);
      expect(forM.some(r => r.month === '2025-12')).toBe(true);
    }
  });
});
