import { describe, expect, it } from 'vitest';
import { decideInstantPause } from './instant-bill-decision';

describe('decideInstantPause', () => {
  it('does not pause when there is no preview data (instant proceeds)', () => {
    expect(decideInstantPause(null)).toEqual({ pause: false, reason: null });
    expect(decideInstantPause(undefined)).toEqual({ pause: false, reason: null });
  });

  it('does not pause for a simple bill where grouping barely differs', () => {
    // item-by-item 79,995 vs grouped 79,900 -> diff 95 = 0.12% < 1%
    const d = decideInstantPause({ totalPvc: 79995, singleClassification: { best: { total: 79900 } } });
    expect(d.pause).toBe(false);
  });

  it('pauses for a composite work regardless of the amounts', () => {
    const d = decideInstantPause({ totalPvc: 50000, singleClassification: { best: { total: 50000 }, composite: { subWorkCount: 6 } } });
    expect(d).toEqual({ pause: true, reason: 'composite' });
  });

  it('pauses when grouping moves the PVC by 1% or more', () => {
    // 49,183 vs 54,226 -> diff 5,043 = 10.3% >= 1%
    const d = decideInstantPause({ totalPvc: 49183, singleClassification: { best: { total: 54226 } } });
    expect(d).toEqual({ pause: true, reason: 'material' });
  });

  it('composite wins over a material check', () => {
    const d = decideInstantPause({ totalPvc: 100000, singleClassification: { best: { total: 130000 }, composite: true } });
    expect(d.reason).toBe('composite');
  });

  it('does not pause when there is no single-class option (best missing)', () => {
    const d = decideInstantPause({ totalPvc: 40000, singleClassification: { best: null } });
    expect(d.pause).toBe(false);
  });

  it('ignores a sub-rupee difference even if it computes above the fraction on tiny totals', () => {
    // total 50, grouped 50.4 -> diff 0.4 (<Rs 1) must not pause despite 0.8% of 50
    const d = decideInstantPause({ totalPvc: 50, singleClassification: { best: { total: 50.4 } } });
    expect(d.pause).toBe(false);
  });

  it('pauses on a genuine 1%+ move that also clears the Rs 1 floor', () => {
    const d = decideInstantPause({ totalPvc: 10000, singleClassification: { best: { total: 10120 } } }); // 1.2%
    expect(d).toEqual({ pause: true, reason: 'material' });
  });
});
