import { describe, expect, it } from 'vitest';
import { isUnitText } from './ireps-direct-pdf-parser';

/**
 * The units on bill NWR/JP/Civil/2023/0078/B1/R1 (mud-pump service) that the reader
 * missed — Rs 80.9 lakh of rows read as nothing because their unit was not recognised.
 * Each wraps down the unit column, so the joined cell arrives with spaces removed and,
 * where a line fell outside the join window, a tail lost.
 */
describe('isUnitText — units the mud-pump bill was billed in', () => {
  it('recognises the whole and the tail-clipped forms', () => {
    for (const u of [
      'Running Metre', 'RunningMetre', 'Running',   // "Runn"/"ing"/"Metre" over 3 lines
      'Per Month', 'PerMonth', 'PerMont', 'Month',   // "Per"/"Mont"/"h"
      'Each/year', 'Eachyear',
      'HP Hour', 'HPHour', 'HP-Hour',
    ]) {
      expect(isUnitText(u), u).toBe(true);
    }
  });

  it('still knows the ordinary units', () => {
    for (const u of ['Cum', 'Sqm', 'Kg', 'Metre', 'Each', 'Hour', 'MT', 'Set', 'PerTrackMetre', 'SquareFoot']) {
      expect(isUnitText(u), u).toBe(true);
    }
  });

  it('does not treat prose or figures as a unit', () => {
    for (const bad of ['', 'Providing', 'the', 'Desilting', '1988.47', '206220.5', 'Now']) {
      expect(isUnitText(bad), bad).toBe(false);
    }
  });
});
