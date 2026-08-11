import { describe, expect, it } from 'vitest';
import {
  PRE_2022_WORK_TYPES,
  calculatePre2022Pvc,
  pre2022BaseMonth,
  pre2022FirstQuarterMonth,
  pre2022QuarterFromDate,
  pre2022QuarterMonths,
  type Pre2022PvcInput,
} from './pvc-pre2022';
import { getBaseMonth, getQuarterFromDate } from './pvc-calculations';

/** Tender 367-DRM-W-GNT-TId-2433 — the agreement this clause was read from. */
const OPENING = new Date(Date.UTC(2021, 7, 20)); // 20 August 2021

const ym = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;

describe('the pre-2022 Clause 46A.6 table', () => {
  it('has every work type summing to 100 percent', () => {
    for (const [key, { percentages: p }] of Object.entries(PRE_2022_WORK_TYPES)) {
      const total = p.labour + p.otherMaterial + p.plantMachinery + p.fuel + p.explosives + p.fixed;
      expect(total, `${key} must sum to 100`).toBe(100);
    }
  });

  it('gives explosives only to the tunnelling type that uses them', () => {
    const withExplosives = Object.entries(PRE_2022_WORK_TYPES).filter(([, v]) => v.percentages.explosives > 0);
    expect(withExplosives.map(([k]) => k)).toEqual(['minor-tunnelling-explosives']);
  });

  it('has no cement or steel percentage, because they sit outside the table', () => {
    // The structural difference from GCC-2022. If a cement or steel share ever appears
    // here, someone has merged the two clauses and the money is wrong.
    for (const { percentages } of Object.values(PRE_2022_WORK_TYPES)) {
      expect(Object.keys(percentages).sort()).toEqual(
        ['explosives', 'fixed', 'fuel', 'labour', 'otherMaterial', 'plantMachinery']
      );
    }
  });
});

describe('base month and quarters', () => {
  it('takes the base month from 28 days before opening', () => {
    // 20 Aug 2021 less 28 days is 23 Jul 2021, so the base month is July 2021.
    expect(ym(pre2022BaseMonth(OPENING))).toBe('2021-07');
  });

  it('can land the base month in the opening month itself', () => {
    // A tender opening on the 30th takes its base from the 2nd of the same month. The
    // GCC-2022 rule can never do this, which is why the two cannot share one function.
    expect(ym(pre2022BaseMonth(new Date(Date.UTC(2021, 7, 30))))).toBe('2021-08');
  });

  it('starts the first quarter the month after opening, not after the base month', () => {
    expect(ym(pre2022FirstQuarterMonth(OPENING))).toBe('2021-09');
  });

  it('lands a bill in a different quarter than the GCC-2022 rule would', () => {
    // The whole reason this is a separate calculator. Under GCC-2022 the base month is
    // July 2021 and quarters start in August; under this clause they start in September.
    // A bill measured in November 2021 is therefore in the first quarter here and the
    // second one there — different months averaged, different money.
    const gcc2022BaseMonth = getBaseMonth(OPENING);
    const measured = new Date(Date.UTC(2021, 10, 15)); // 15 November 2021

    expect(pre2022QuarterFromDate(measured, OPENING)).toBe('Q1-2021');
    expect(getQuarterFromDate(measured, gcc2022BaseMonth)).toBe('Q2-2021');
  });

  it('walks the quarters forward three months at a time', () => {
    const at = (y: number, m: number) => pre2022QuarterFromDate(new Date(Date.UTC(y, m, 15)), OPENING);
    expect(at(2021, 8)).toBe('Q1-2021'); // September 2021
    expect(at(2021, 10)).toBe('Q1-2021'); // November 2021
    expect(at(2021, 11)).toBe('Q2-2021'); // December 2021
    expect(at(2022, 1)).toBe('Q2-2021'); // February 2022 — still the quarter that began in Dec
    expect(at(2022, 2)).toBe('Q3-2022'); // March 2022
    expect(at(2023, 4)).toBe('Q7-2023'); // May 2023 — where this contract's first bill falls
  });

  it('averages the right three months for a quarter', () => {
    expect(pre2022QuarterMonths('Q1-2021', OPENING).map(ym)).toEqual(['2021-09', '2021-10', '2021-11']);
    expect(pre2022QuarterMonths('Q2-2021', OPENING).map(ym)).toEqual(['2021-12', '2022-01', '2022-02']);
    expect(pre2022QuarterMonths('Q7-2023', OPENING).map(ym)).toEqual(['2023-03', '2023-04', '2023-05']);
  });

  it('flags a measurement date before the first quarter instead of guessing', () => {
    expect(pre2022QuarterFromDate(new Date(Date.UTC(2021, 7, 25)), OPENING)).toBe('Q0');
    expect(() => pre2022QuarterMonths('Q0', OPENING)).toThrow(/before the first quarter/i);
  });
});

/**
 * A worked example with round numbers, so every figure below can be checked on paper.
 *
 * Earthwork & Bridges: labour 20, other material 10, plant 30, fuel 25, fixed 15.
 * Gross value of work 10,00,000, of which cement 1,00,000 and steel 50,000 were
 * supplied — so the table works on 8,50,000.
 */
const WORKED: Pre2022PvcInput = {
  workType: 'earthwork-bridges-ballast-tunnelling',
  grossValueOfWork: 1_000_000,
  cement: { value: 100_000, index: { base: 100, quarter: 108 } },
  steel: [{ category: 'Reinforcement bars', value: 50_000, index: { base: 100, quarter: 90 } }],
  indices: {
    labour: { base: 100, quarter: 110 },
    otherMaterial: { base: 100, quarter: 105 },
    plantMachinery: { base: 100, quarter: 102 },
    fuel: { base: 100, quarter: 120 },
  },
};

describe('pricing a bill under the pre-2022 clause', () => {
  const result = calculatePre2022Pvc(WORKED);
  const amountOf = (name: string) => result.components.find(c => c.name.startsWith(name))?.amount;

  it('takes cement and steel out of the amount the table works on', () => {
    expect(result.varyingAmount).toBe(850_000);
    expect(result.cementValue).toBe(100_000);
    expect(result.steelValue).toBe(50_000);
  });

  it('prices each component off that reduced amount', () => {
    expect(amountOf('Labour')).toBeCloseTo(17_000, 6); // 850000 x 10 x 20% / 100
    expect(amountOf('Other Materials')).toBeCloseTo(4_250, 6); // 850000 x 5 x 10% / 100
    expect(amountOf('Plant & Machinery')).toBeCloseTo(5_100, 6); // 850000 x 2 x 30% / 100
    expect(amountOf('Fuel & Lubricants')).toBeCloseTo(42_500, 6); // 850000 x 20 x 25% / 100
  });

  it('pays cement and steel on the value supplied with no 85% factor', () => {
    // GCC-2022 would pay 85% of these. This clause pays all of it — 8,000, not 6,800.
    expect(amountOf('Cement supplied')).toBeCloseTo(8_000, 6);
    expect(amountOf('Steel supplied')).toBeCloseTo(-5_000, 6);
  });

  it('lets a falling index reduce the bill', () => {
    // Steel fell from 100 to 90, so it is recovered from the contractor, not paid.
    expect(amountOf('Steel supplied')).toBeLessThan(0);
  });

  it('shows the fixed portion but pays nothing on it', () => {
    const fixed = result.components.find(c => c.name.startsWith('Fixed'));
    expect(fixed?.percentage).toBe(15);
    expect(fixed?.amount).toBe(0);
  });

  it('adds up to the total', () => {
    expect(result.totalPvc).toBeCloseTo(71_850, 6);
  });

  it('leaves out explosives for a work type that has none', () => {
    expect(result.components.some(c => c.name === 'Explosives')).toBe(false);
  });

  it('prices explosives for tunnelling that uses them', () => {
    const tunnelling = calculatePre2022Pvc({
      ...WORKED,
      workType: 'minor-tunnelling-explosives',
      indices: { ...WORKED.indices, explosives: { base: 100, quarter: 130 } },
    });
    // 850000 x 30 x 20% / 100
    expect(tunnelling.components.find(c => c.name === 'Explosives')?.amount).toBeCloseTo(51_000, 6);
  });
});

describe('refusing to price what it cannot price', () => {
  it('stops when an index is missing rather than treating it as no change', () => {
    // Zero is a real answer when prices held steady, so it must never also mean "no
    // data" — that is how a statement quietly understates what is owed.
    const noFuel = { ...WORKED, indices: { ...WORKED.indices, fuel: undefined as any } };
    expect(() => calculatePre2022Pvc(noFuel)).toThrow(/Missing fuel index/i);
  });

  it('stops when a work type needs explosives and none were supplied', () => {
    expect(() => calculatePre2022Pvc({ ...WORKED, workType: 'minor-tunnelling-explosives' }))
      .toThrow(/Missing explosives index/i);
  });

  it('stops on a zero base index instead of dividing by it', () => {
    const zeroBase = { ...WORKED, indices: { ...WORKED.indices, labour: { base: 0, quarter: 110 } } };
    expect(() => calculatePre2022Pvc(zeroBase)).toThrow(/greater than zero/i);
  });

  it('stops when cement and steel exceed the work done', () => {
    expect(() => calculatePre2022Pvc({ ...WORKED, grossValueOfWork: 100_000 }))
      .toThrow(/exceed the gross value/i);
  });

  it('rejects an unknown work type', () => {
    expect(() => calculatePre2022Pvc({ ...WORKED, workType: 'nonsense' as any })).toThrow(/Unknown/i);
  });
});

describe('a contract that supplied no cement or steel', () => {
  it('works the table on the full value of work done', () => {
    const plain = calculatePre2022Pvc({
      workType: 'building',
      grossValueOfWork: 1_000_000,
      indices: {
        labour: { base: 100, quarter: 110 },
        otherMaterial: { base: 100, quarter: 105 },
        plantMachinery: { base: 100, quarter: 102 },
        fuel: { base: 100, quarter: 120 },
      },
    });
    expect(plain.varyingAmount).toBe(1_000_000);
    // Building is labour 40 / material 35 / plant 5 / fuel 5.
    expect(plain.components.find(c => c.name === 'Labour')?.amount).toBeCloseTo(40_000, 6);
    expect(plain.totalPvc).toBeCloseTo(40_000 + 17_500 + 1_000 + 10_000, 6);
  });
});
