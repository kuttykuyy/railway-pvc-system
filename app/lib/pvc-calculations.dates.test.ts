import { describe, it, expect, vi } from 'vitest';

// pvc-calculations imports ./db (and ./classification-helper which also imports ./db).
// Mock ./db so importing the module doesn't construct a real Prisma client / start timers.
vi.mock('./db', () => ({ prisma: {} }));

import { getQuarterFromDate, getQuarterMonths, getBaseMonth } from './pvc-calculations';

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

describe('getQuarterMonths', () => {
  const monthKeys = (dates: Date[]) =>
    dates.map(d => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);

  it('averages the three months of the quarter, counted from the month after base', () => {
    const base = new Date(Date.UTC(2023, 4, 1)); // base month = May 2023
    expect(monthKeys(getQuarterMonths('Q1-2023', base))).toEqual(['2023-06', '2023-07', '2023-08']);
    expect(monthKeys(getQuarterMonths('Q2-2023', base))).toEqual(['2023-09', '2023-10', '2023-11']);
  });

  it('agrees with getQuarterFromDate on a measurement in the first month of a quarter', () => {
    // A May 2023 base puts 26 Jun 2026 in Q13, whose months are Jun-Aug 2026. June is the
    // FIRST month of that quarter, so two of the three months are still unpublished and
    // the bill prices provisionally until they are. This is the rule, not a rounding slip.
    const base = new Date(Date.UTC(2023, 4, 1));
    const quarter = getQuarterFromDate(new Date(Date.UTC(2026, 5, 26)), base);
    expect(quarter).toBe('Q13-2026');
    expect(monthKeys(getQuarterMonths(quarter, base))).toEqual(['2026-06', '2026-07', '2026-08']);
  });

  it('keeps the last month of a quarter in that quarter', () => {
    const base = new Date(Date.UTC(2023, 4, 1));
    expect(getQuarterFromDate(new Date(Date.UTC(2026, 7, 31)), base)).toBe('Q13-2026'); // 31 Aug
    expect(getQuarterFromDate(new Date(Date.UTC(2026, 8, 1)), base)).toBe('Q14-2026');  // 1 Sep
  });

  it('holds a quarter that spans a year boundary together', () => {
    const base = new Date(Date.UTC(2023, 9, 1)); // base month = Oct 2023
    expect(monthKeys(getQuarterMonths('Q1-2023', base))).toEqual(['2023-11', '2023-12', '2024-01']);
  });
});
