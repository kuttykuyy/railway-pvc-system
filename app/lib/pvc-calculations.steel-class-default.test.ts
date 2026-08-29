import { describe, expect, it } from 'vitest';
import { defaultSteelTypesForClass } from './pvc-calculations';

/**
 * The class-nature steel default: …B (supply of steel) is used only for TMT
 * reinforcement; …D (fabrication & erection) is the other-than-TMT structural steel.
 * Explicit categories on the entry always win.
 */
describe('defaultSteelTypesForClass', () => {
  it('defaults a …B class with no recorded categories to TMT only', () => {
    expect(defaultSteelTypesForClass('5B', [])).toEqual(['TMT']);
    expect(defaultSteelTypesForClass('1b', null)).toEqual(['TMT']);
  });

  it('defaults a …D class with no recorded categories to the non-TMT categories', () => {
    expect(defaultSteelTypesForClass('5D', undefined)).toEqual(['ANGLE_CHANNEL', 'PLATES', 'OTHER_SECTIONS']);
  });

  it('never overrides categories recorded on the entry', () => {
    expect(defaultSteelTypesForClass('5B', ['PLATES'])).toEqual(['PLATES']);
    expect(defaultSteelTypesForClass('5D', ['TMT'])).toEqual(['TMT']);
  });

  it('leaves other classes on the existing fallback (empty → average of all four)', () => {
    // [] and null are equivalent downstream: resolveSteelIndexBasis averages all four.
    expect(defaultSteelTypesForClass('5A', [])).toEqual([]);
    expect(defaultSteelTypesForClass('5E', null)).toBeNull();
    expect(defaultSteelTypesForClass('', null)).toBeNull();
    expect(defaultSteelTypesForClass(undefined, null)).toBeNull();
  });
});
