import { describe, it, expect } from 'vitest';
import { calculateTotalPvc } from './classification-pvc';

const zero = { fixed: 0, labour: 0, steel: 0, cement: 0, plantMachinery: 0, fuel: 0, otherMaterials: 0, explosives: 0 };

describe('calculateTotalPvc', () => {
  it('computes labour PVC = amount x pct x index variation', () => {
    // 100000 x 50% x (110-100)/100 = 50000 x 0.10 = 5000
    const pvc = calculateTotalPvc(
      { ...zero, labour: 50, fixed: 50 },
      100000,
      { base: { Labour: 100 }, current: { Labour: 110 } },
    );
    expect(pvc).toBe(5000);
  });

  it('ignores the fixed component (no price variation)', () => {
    const pvc = calculateTotalPvc(
      { ...zero, fixed: 100 },
      100000,
      { base: { Labour: 100 }, current: { Labour: 200 } },
    );
    expect(pvc).toBe(0);
  });

  it('returns a negative PVC when the index falls below base', () => {
    // 100000 x 20% x (90-100)/100 = 20000 x -0.10 = -2000
    const pvc = calculateTotalPvc(
      { ...zero, cement: 20 },
      100000,
      { base: { 'RBI Cement': 100 }, current: { 'RBI Cement': 90 } },
    );
    expect(pvc).toBe(-2000);
  });

  it('returns 0 when no indices are available', () => {
    expect(calculateTotalPvc({ ...zero, labour: 50 }, 100000, { base: {}, current: {} })).toBe(0);
  });

  it('sums multiple components', () => {
    // labour: 100000*30%*(110-100)/100 = 3000 ; cement: 100000*10%*(120-100)/100 = 2000
    const pvc = calculateTotalPvc(
      { ...zero, labour: 30, cement: 10 },
      100000,
      { base: { Labour: 100, 'RBI Cement': 100 }, current: { Labour: 110, 'RBI Cement': 120 } },
    );
    expect(pvc).toBe(5000);
  });

  it('averages the four steel sub-indices for the steel component', () => {
    // steel base avg = 100, current avg = 110 -> 100000*10%*(10/100) = 1000
    const pvc = calculateTotalPvc(
      { ...zero, steel: 10 },
      100000,
      {
        base: { 'Steel TMT Bars': 100, 'Steel Angle/Channel': 100, 'Steel Plates': 100, 'Steel Other Sections': 100 },
        current: { 'Steel TMT Bars': 110, 'Steel Angle/Channel': 110, 'Steel Plates': 110, 'Steel Other Sections': 110 },
      },
    );
    expect(pvc).toBe(1000);
  });
});
