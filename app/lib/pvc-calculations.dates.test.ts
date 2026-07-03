import { describe, it, expect, vi } from 'vitest';

// pvc-calculations imports ./db (and ./classification-helper which also imports ./db).
// Mock ./db so importing the module doesn't construct a real Prisma client / start timers.
vi.mock('./db', () => ({ prisma: {} }));

import { getQuarterFromDate, getBaseMonth } from './pvc-calculations';

describe('getBaseMonth', () => {
  it('returns the first day of the month before the date of opening', () => {
    const b = getBaseMonth(new Date(2024, 6, 15)); // 15 Jul 2024
    expect(b.getFullYear()).toBe(2024);
    expect(b.getMonth()).toBe(5); // June
    expect(b.getDate()).toBe(1);
  });

  it('rolls back across the year boundary for January openings', () => {
    const b = getBaseMonth(new Date(2024, 0, 10)); // 10 Jan 2024
    expect(b.getFullYear()).toBe(2023);
    expect(b.getMonth()).toBe(11); // December
  });

  it('throws on an invalid date', () => {
    expect(() => getBaseMonth(new Date('not-a-date'))).toThrow();
  });
});

describe('getQuarterFromDate', () => {
  const base = new Date(2024, 5, 1); // base month = June 2024; quarters start July 2024

  it('places the first three months after base into Q1', () => {
    expect(getQuarterFromDate(new Date(2024, 6, 15), base)).toBe('Q1-2024'); // Jul
    expect(getQuarterFromDate(new Date(2024, 8, 1), base)).toBe('Q1-2024');  // Sep
  });

  it('rolls to Q2 at the fourth month', () => {
    expect(getQuarterFromDate(new Date(2024, 9, 1), base)).toBe('Q2-2024'); // Oct
  });

  it('returns Q0 for dates on/before the base month', () => {
    expect(getQuarterFromDate(new Date(2024, 4, 1), base)).toBe('Q0'); // May 2024
  });

  it('always returns a Q<n>-<year> shape for valid future dates', () => {
    expect(getQuarterFromDate(new Date(2026, 0, 15), base)).toMatch(/^Q\d+-\d{4}$/);
  });
});
