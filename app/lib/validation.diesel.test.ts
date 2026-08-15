import { describe, it, expect } from 'vitest';
import { isPlausibleDieselPrice } from './validation';

/**
 * The fuel-price import refused only NaN, so these all used to be accepted — and a bad
 * rate is not one bad row: every bill priced from a quarter containing it carries the
 * error in its fuel component.
 */
describe('isPlausibleDieselPrice', () => {
  it('accepts real diesel rates', () => {
    for (const rate of [89.62, 94.27, 102.5, 1, 500]) {
      expect(isPlausibleDieselPrice(rate)).toBe(true);
    }
  });

  it('accepts a rate that arrives as a string, as form data does', () => {
    expect(isPlausibleDieselPrice('94.27')).toBe(true);
  });

  it('refuses zero and negatives', () => {
    expect(isPlausibleDieselPrice(0)).toBe(false);
    expect(isPlausibleDieselPrice(-50)).toBe(false);
  });

  it('refuses a misplaced decimal point', () => {
    // 9000 for 90.00 — the realistic typing mistake, and previously accepted.
    expect(isPlausibleDieselPrice(9000)).toBe(false);
  });

  it('refuses what is not a number at all', () => {
    for (const junk of ['', 'abc', null, undefined, NaN, Infinity, {}, []]) {
      expect(isPlausibleDieselPrice(junk)).toBe(false);
    }
  });
});
