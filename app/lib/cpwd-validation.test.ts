import { describe, expect, it } from 'vitest';
import { deriveTonnagesFromEntries, buildEngineBLines } from './engine-b-derive';
import { computeCpwd10ca } from './pvc-engine-b';
import { computeCpwd10cc, cpwd10ccEligibility } from './pvc-cpwd-10cc';

/**
 * End-to-end validation of one worked CPWD bill through the exact pipeline the bill
 * compute uses (derive tonnages → 10CA, indices + Schedule E → 10CC, combined). Every
 * figure below is computed by hand in the comments; this is the "manual calc" the whole
 * feature is checked against, locked so it can never drift.
 *
 * The scenario — a Delhi-NCR CPWD contract, 18-month completion (10CC eligible), tender
 * base month Mar-2024, bill month Jul-2026, gross work in this bill ₹20,00,000:
 *
 *   10CA materials (quantity × price movement, ₹/MT):
 *     cement  50 MT × (4915.25 − 4200) = 50 × 715.25   = 35,762.50
 *     TMT     12 MT × (45760   − 45000) = 12 × 760      =  9,120.00
 *     struct   3 MT × (48410   − 47000) =  3 × 1410     =  4,230.00
 *     10CA total                                        = 49,112.50
 *
 *   10CC (W = 0.85 × 20,00,000 = 17,00,000; Schedule E 25/20/10):
 *     labour     1700000 × 0.25 × (110−100)/100 = 425000 × 0.10 = 42,500
 *     materials  1700000 × 0.20 × (108−100)/100 = 340000 × 0.08 = 27,200
 *     POL        1700000 × 0.10 × (105−100)/100 = 170000 × 0.05 =  8,500
 *     10CC total                                                = 78,200
 *
 *   Combined CPWD price variation = 49,112.50 + 78,200 = 1,27,312.50
 */
describe('CPWD bill — end-to-end validation against a manual calc', () => {
  // Cement comes from concrete items via the DSR coefficient; steel is a measured item.
  const cementCoeff = new Map<string, number>([['5.35', 0.4], ['52090', 0.2]]);
  const units = new Map<string, string>([['025082', 'Kg'], ['STR1', 'MT']]);

  const entries = [
    { itemNumber: '5.35', quantity: 100 },                         // 0.4 × 100 = 40 MT cement
    { itemNumber: '52090', quantity: 50 },                         // 0.2 × 50  = 10 MT cement
    { itemNumber: '025082', quantity: 12000, steelTypes: ['TMT'] }, // 12000 kg = 12 MT TMT
    { itemNumber: 'STR1', quantity: 3, steelTypes: ['PLATES'] },    // 3 MT structural
  ];

  it('derives the right tonnages from the bill items', () => {
    const t = deriveTonnagesFromEntries(entries, cementCoeff, units);
    expect(t.cementMT).toBe(50);
    expect(t.steelTmtMT).toBe(12);
    expect(t.steelStructuralMT).toBe(3);
    expect(t.flags).toHaveLength(0);
  });

  it('prices 10CA to 49,112.50 from those tonnages and the circular prices', () => {
    const t = deriveTonnagesFromEntries(entries, cementCoeff, units);
    const lines = buildEngineBLines(t, {
      'cement-opc': { basePrice: 4200, currentPrice: 4915.25 },
      'steel-tmt': { basePrice: 45000, currentPrice: 45760 },
      'steel-structural': { basePrice: 47000, currentPrice: 48410 },
    });
    const r = computeCpwd10ca(lines);
    expect(r.totalVariation).toBe(49112.5);
  });

  it('is 10CC-eligible at 18 months against the 12-month threshold', () => {
    expect(cpwd10ccEligibility(18, 12).eligible).toBe(true);
  });

  it('prices 10CC to 78,200 with the 15% haircut and Schedule E 25/20/10', () => {
    const r = computeCpwd10cc({
      workValue: 2_000_000,
      components: [
        { key: 'labour', percent: 25, baseIndex: 100, currentIndex: 110 },
        { key: 'materials', percent: 20, baseIndex: 100, currentIndex: 108 },
        { key: 'pol', percent: 10, baseIndex: 100, currentIndex: 105 },
      ],
    });
    expect(r.escalableBase).toBe(1_700_000);
    expect(r.lines[0].variation).toBe(42_500);
    expect(r.lines[1].variation).toBe(27_200);
    expect(r.lines[2].variation).toBe(8_500);
    expect(r.totalVariation).toBe(78_200);
  });

  it('the combined CPWD variation is 1,27,312.50', () => {
    const t = deriveTonnagesFromEntries(entries, cementCoeff, units);
    const ca = computeCpwd10ca(buildEngineBLines(t, {
      'cement-opc': { basePrice: 4200, currentPrice: 4915.25 },
      'steel-tmt': { basePrice: 45000, currentPrice: 45760 },
      'steel-structural': { basePrice: 47000, currentPrice: 48410 },
    }));
    const cc = computeCpwd10cc({
      workValue: 2_000_000,
      components: [
        { key: 'labour', percent: 25, baseIndex: 100, currentIndex: 110 },
        { key: 'materials', percent: 20, baseIndex: 100, currentIndex: 108 },
        { key: 'pol', percent: 10, baseIndex: 100, currentIndex: 105 },
      ],
    });
    expect(Math.round((ca.totalVariation + cc.totalVariation) * 100) / 100).toBe(127_312.5);
  });
});
