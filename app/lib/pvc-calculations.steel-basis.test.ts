import { describe, expect, it } from 'vitest';
import { resolveSteelIndexBasis, type SteelIndexRow } from './pvc-calculations';

/**
 * The bug this locks down: the calculation blended every steel category that applied,
 * while the PDF printed the FIRST of them beside that blended amount. The statement
 * then failed its own arithmetic — the printed I0, I1 and amount did not multiply out.
 * Both sides now read resolveSteelIndexBasis, so these are the numbers that get printed
 * AND the numbers the money came from.
 */
const map = (rows: SteelIndexRow[]) => new Map(rows.map(r => [r.indexName, r]));

const FOUR: SteelIndexRow[] = [
  { indexName: 'Steel TMT Bars',       baseValue: 100, average: 110 },
  { indexName: 'Steel Angle/Channel',  baseValue: 200, average: 260 },
  { indexName: 'Steel Plates',         baseValue: 300, average: 300 },
  { indexName: 'Steel Other Sections', baseValue: 400, average: 430 },
];

describe('resolveSteelIndexBasis', () => {
  it('uses only the categories recorded on the bill', () => {
    const basis = resolveSteelIndexBasis(map(FOUR), ['TMT']);
    expect(basis?.baseValue).toBe(100);
    expect(basis?.averageValue).toBe(110);
    expect(basis?.variation).toBeCloseTo(0.1, 10);
    expect(basis?.indexNames).toEqual(['Steel TMT Bars']);
    expect(basis?.usedDefault).toBe(false);
  });

  it('blends when a bill is priced on more than one category', () => {
    const basis = resolveSteelIndexBasis(map(FOUR), ['TMT', 'PLATES']);
    expect(basis?.baseValue).toBe(200);   // (100 + 300) / 2
    expect(basis?.averageValue).toBe(205); // (110 + 300) / 2
    expect(basis?.indexNames).toEqual(['Steel TMT Bars', 'Steel Plates']);
    expect(basis?.usedDefault).toBe(false);
  });

  it('averages all four when no category was recorded, and says so', () => {
    const basis = resolveSteelIndexBasis(map(FOUR), null);
    expect(basis?.baseValue).toBe(250);   // (100+200+300+400) / 4
    expect(basis?.averageValue).toBe(275); // (110+260+300+430) / 4
    expect(basis?.usedDefault).toBe(true);
    expect(basis?.indexNames).toHaveLength(4);
    // The printed line must multiply out: amount x variation = the PVC amount.
    expect(1_000_000 * basis!.variation).toBeCloseTo(100_000, 6);
  });

  it('treats an empty category list the same as none recorded', () => {
    expect(resolveSteelIndexBasis(map(FOUR), [])?.usedDefault).toBe(true);
  });

  it('falls back to the default when a category has no index published', () => {
    const only = map([FOUR[0], FOUR[2]]);
    const basis = resolveSteelIndexBasis(only, ['ANGLE_CHANNEL']);
    expect(basis?.usedDefault).toBe(true);
    expect(basis?.indexNames).toEqual(['Steel TMT Bars', 'Steel Plates']);
  });

  it('finds city-suffixed indices, which is how JPC steel is published', () => {
    const mumbai = map(FOUR.map(r => ({ ...r, indexName: r.indexName + ' - Mumbai' })));
    const basis = resolveSteelIndexBasis(mumbai, ['TMT']);
    expect(basis?.indexNames).toEqual(['Steel TMT Bars - Mumbai']);
    expect(basis?.baseValue).toBe(100);
  });

  it('returns null when there is no steel index at all', () => {
    expect(resolveSteelIndexBasis(new Map(), ['TMT'])).toBeNull();
  });
});
