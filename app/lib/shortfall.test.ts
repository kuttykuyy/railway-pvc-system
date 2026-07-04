import { describe, it, expect } from 'vitest';
import { computeShortfall, computeEntitlementComponents } from './shortfall';

const pvc = {
  labourPvc: 86155.28, plantMachineryPvc: 30517.15, fuelPowerPvc: -4582.03,
  cementPvc: -50000, dedicatedCementPvc: -43275.38,
  steelPvc: -13603.83, dedicatedSteelTmtBarsPvc: -10000,
  otherMaterialsPvc: 30366.56, explosivesPvc: 0, totalPvc: 25577.75,
};

describe('computeEntitlementComponents', () => {
  it('rolls dedicated cement/steel into their component', () => {
    const e = computeEntitlementComponents(pvc);
    expect(e.cement).toBeCloseTo(-93275.38, 2);
    expect(e.steel).toBeCloseTo(-23603.83, 2);
    expect(e.total).toBe(25577.75); // uses authoritative totalPvc
  });
});

describe('computeShortfall', () => {
  it('reports no railway data when nothing entered', () => {
    const r = computeShortfall(pvc, null);
    expect(r.hasRailwayData).toBe(false);
    expect(r.entitlementTotal).toBe(25577.75);
  });

  it('computes recoverable when Railway underpaid (total only)', () => {
    const r = computeShortfall(pvc, { railwayTotal: 10000 });
    expect(r.shortfallTotal).toBeCloseTo(15577.75, 2);
    expect(r.recoverable).toBeCloseTo(15577.75, 2);
    expect(r.overpaid).toBe(0);
    expect(r.shortfallPct).toBeCloseTo(60.9, 1);
  });

  it('reports overpaid when Railway paid more', () => {
    const r = computeShortfall(pvc, { railwayTotal: 30000 });
    expect(r.recoverable).toBe(0);
    expect(r.overpaid).toBeCloseTo(4422.25, 2);
  });

  it('uses the component sum as the total when only components are entered', () => {
    const r = computeShortfall(pvc, { railwayLabour: 50000, railwaySteel: -23603.83 });
    expect(r.hasComponentBreakdown).toBe(true);
    expect(r.railwayTotal).toBeCloseTo(26396.17, 2); // 50000 + (-23603.83)
    const labour = r.rows.find(x => x.key === 'labour')!;
    expect(labour.shortfall).toBeCloseTo(36155.28, 2);
    const cement = r.rows.find(x => x.key === 'cement')!;
    expect(cement.railwayPaid).toBeNull(); // not entered
    expect(cement.shortfall).toBeNull();
  });
});
