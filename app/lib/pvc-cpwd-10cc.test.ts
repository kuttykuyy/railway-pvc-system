import { describe, expect, it } from 'vitest';
import { computeCpwd10cc, CPWD_10CC_DEFAULT_HAIRCUT, cpwd10ccEligibility } from './pvc-cpwd-10cc';

describe('computeCpwd10cc', () => {
  it('applies the 15% haircut and prices each component on its index ratio', () => {
    // Work 10,00,000; 85% = 8,50,000 escalable.
    const r = computeCpwd10cc({
      workValue: 1_000_000,
      components: [
        { key: 'labour',    percent: 25, baseIndex: 100, currentIndex: 110 }, // +10%
        { key: 'materials', percent: 60, baseIndex: 150, currentIndex: 165 }, // +10%
        { key: 'pol',       percent: 15, baseIndex: 200, currentIndex: 210 }, // +5%
      ],
    });
    expect(r.base85).toBe(850_000);
    expect(r.escalableBase).toBe(850_000);
    // labour:    850000 × 0.25 × 0.10 = 21,250
    // materials: 850000 × 0.60 × 0.10 = 51,000
    // pol:       850000 × 0.15 × 0.05 =  6,375
    expect(r.lines[0].variation).toBe(21_250);
    expect(r.lines[1].variation).toBe(51_000);
    expect(r.lines[2].variation).toBe(6_375);
    expect(r.totalVariation).toBe(78_625);
  });

  it('defaults the haircut to 0.85', () => {
    expect(CPWD_10CC_DEFAULT_HAIRCUT).toBe(0.85);
    const r = computeCpwd10cc({ workValue: 100, components: [] });
    expect(r.base85).toBe(85);
  });

  it('deducts departmental material (K) and fixed-charge services (L) from the base', () => {
    const r = computeCpwd10cc({
      workValue: 1_000_000,
      departmentalMaterial: 100_000,
      fixedChargeServices: 50_000,
      components: [{ key: 'materials', percent: 100, baseIndex: 100, currentIndex: 110 }],
    });
    // N = 850000 ; W = 850000 − 150000 = 700000 ; V = 700000 × 1.0 × 0.10 = 70,000
    expect(r.escalableBase).toBe(700_000);
    expect(r.lines[0].variation).toBe(70_000);
  });

  it('goes negative when an index has fallen', () => {
    const r = computeCpwd10cc({
      workValue: 1_000_000,
      components: [{ key: 'materials', percent: 100, baseIndex: 120, currentIndex: 108 }], // −10%
    });
    expect(r.lines[0].variation).toBe(-85_000); // 850000 × 1.0 × −0.10
    expect(r.totalVariation).toBe(-85_000);
  });

  it('treats a missing/zero base index as a zero line, without throwing', () => {
    const r = computeCpwd10cc({
      workValue: 1_000_000,
      components: [
        { key: 'labour', percent: 25, baseIndex: 0, currentIndex: 110 },
        { key: 'pol', percent: 15, baseIndex: NaN as any, currentIndex: 110 },
      ],
    });
    expect(r.lines[0].variation).toBe(0);
    expect(r.lines[1].variation).toBe(0);
    expect(r.totalVariation).toBe(0);
  });

  it('never lets the escalable base go negative', () => {
    const r = computeCpwd10cc({
      workValue: 100_000,
      departmentalMaterial: 200_000, // K bigger than the 85% base
      components: [{ key: 'materials', percent: 100, baseIndex: 100, currentIndex: 110 }],
    });
    expect(r.escalableBase).toBe(0);
    expect(r.totalVariation).toBe(0);
  });
});

describe('cpwd10ccEligibility', () => {
  it('is eligible only when completion EXCEEDS the threshold', () => {
    expect(cpwd10ccEligibility(18, 12).eligible).toBe(true);
    expect(cpwd10ccEligibility(13, 12).eligible).toBe(true);
    expect(cpwd10ccEligibility(12, 12).eligible).toBe(false); // "exceeds", so 12 is out
    expect(cpwd10ccEligibility(6, 12).eligible).toBe(false);
  });

  it('gives a reason when it is not eligible', () => {
    const r = cpwd10ccEligibility(6, 12);
    expect(r.note).toMatch(/6-month/);
    expect(r.note).toMatch(/12-month threshold/);
  });

  it('does not gate out an unknown completion period, but says so', () => {
    const r = cpwd10ccEligibility(null, 12);
    expect(r.eligible).toBe(true);
    expect(r.note).toMatch(/not verified/i);
  });

  it('respects a different threshold (e.g. 6)', () => {
    expect(cpwd10ccEligibility(9, 6).eligible).toBe(true);
    expect(cpwd10ccEligibility(6, 6).eligible).toBe(false);
  });
});
