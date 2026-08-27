import { describe, expect, it } from 'vitest';
import { toMetricTonnes, deriveTonnagesFromEntries, buildEngineBLines } from './engine-b-derive';
import { computeCpwd10ca } from './pvc-engine-b';

describe('toMetricTonnes', () => {
  it('passes tonnes through and converts kg and quintals', () => {
    expect(toMetricTonnes(5, 'MT')).toBe(5);
    expect(toMetricTonnes(5, 'Tonne')).toBe(5);
    expect(toMetricTonnes(3000, 'Kg')).toBe(3);
    expect(toMetricTonnes(20, 'Quintal')).toBe(2);
  });

  it('returns null for an unknown or missing unit — the caller flags it', () => {
    expect(toMetricTonnes(5, 'Cum')).toBeNull();
    expect(toMetricTonnes(5, '')).toBeNull();
    expect(toMetricTonnes(5, null)).toBeNull();
    expect(toMetricTonnes(NaN, 'MT')).toBeNull();
  });
});

describe('deriveTonnagesFromEntries', () => {
  const cementCoeff = new Map<string, number>([['5.35', 0.4], ['52090', 0.2]]);
  const units = new Map<string, string>([['025082', 'MT'], ['025051', 'Kg'], ['STR1', 'MT']]);

  it('derives cement from coefficient x quantity', () => {
    const t = deriveTonnagesFromEntries(
      [{ itemNumber: '5.35', quantity: 100 }, { itemNumber: '52090', quantity: 50 }],
      cementCoeff, units,
    );
    expect(t.cementMT).toBe(50); // 0.4×100 + 0.2×50 = 40 + 10
    expect(t.steelTmtMT).toBe(0);
  });

  it('splits reinforcement (TMT) from structural steel and converts units', () => {
    const t = deriveTonnagesFromEntries(
      [
        { itemNumber: '025082', quantity: 12, steelTypes: ['TMT'] },
        { itemNumber: '025051', quantity: 4000, steelTypes: ['ANGLE_CHANNEL'] }, // 4000 kg = 4 MT
      ],
      cementCoeff, units,
    );
    expect(t.steelTmtMT).toBe(12);
    expect(t.steelStructuralMT).toBe(4);
    expect(t.flags).toHaveLength(0);
  });

  it('flags a steel item whose unit cannot be resolved, without pricing it', () => {
    const t = deriveTonnagesFromEntries(
      [{ itemNumber: 'UNKNOWN', quantity: 10, steelTypes: ['TMT'] }],
      cementCoeff, units,
    );
    expect(t.steelTmtMT).toBe(0);
    expect(t.flags).toHaveLength(1);
    expect(t.flags[0].code).toBe('UNKNOWN');
  });

  it('reads per-item detail out of itemRows when present', () => {
    const t = deriveTonnagesFromEntries(
      [{ itemRows: [{ itemNumber: '5.35', quantity: 25 }, { itemNumber: '5.35', quantity: 25 }] }],
      cementCoeff, units,
    );
    expect(t.cementMT).toBe(20); // 0.4 × (25+25)
  });

  it('ignores zero and negative quantities', () => {
    const t = deriveTonnagesFromEntries(
      [{ itemNumber: '5.35', quantity: 0 }, { itemNumber: '5.35', quantity: -10 }],
      cementCoeff, units,
    );
    expect(t.cementMT).toBe(0);
  });
});

describe('buildEngineBLines + computeCpwd10ca (end to end, pure)', () => {
  it('prices derived tonnages against CPWD prices', () => {
    const tonnages = { cementMT: 50, steelTmtMT: 12, steelStructuralMT: 0 };
    const lines = buildEngineBLines(tonnages, {
      'cement-opc': { basePrice: 3978, currentPrice: 4915.25 },
      'steel-tmt': { basePrice: 45133, currentPrice: 45760 },
    });
    const r = computeCpwd10ca(lines);
    // cement 50×937.25 = 46,862.50 ; steel 12×627 = 7,524 ; total 54,386.50
    expect(r.totalVariation).toBe(54386.5);
  });

  it('skips a material with no price pair', () => {
    const lines = buildEngineBLines(
      { cementMT: 50, steelTmtMT: 12, steelStructuralMT: 3 },
      { 'cement-opc': { basePrice: 3978, currentPrice: 4915.25 } },
    );
    expect(lines).toHaveLength(1); // only cement has a price
  });
});
