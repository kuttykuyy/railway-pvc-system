import { describe, expect, it } from 'vitest';
import { normalizePhone, isIndianMobile } from './phone-validation';

/**
 * The same mobile used to be stored four different ways, which is why the database
 * could not hold a unique constraint on it and why the WhatsApp bot had to guess.
 * Every form below has to come out as one string.
 */
describe('normalizePhone', () => {
  it('reduces every way one Indian mobile gets written to a single value', () => {
    const forms = [
      '9876543210',
      '09876543210',
      '919876543210',
      '+919876543210',
      '+91 98765 43210',
      '+91-98765-43210',
      '0919876543210',
      ' 91 9876543210 ',
    ];
    const normalized = forms.map(normalizePhone);
    expect(new Set(normalized)).toEqual(new Set(['+919876543210']));
  });

  it('keeps a country code that is already there', () => {
    expect(normalizePhone('+14155550123')).toBe('+14155550123');
    expect(normalizePhone('+442071838750')).toBe('+442071838750');
  });

  it('refuses what cannot be made into a number', () => {
    expect(normalizePhone('')).toBeNull();
    expect(normalizePhone(null)).toBeNull();
    expect(normalizePhone(undefined)).toBeNull();
    expect(normalizePhone('abcd')).toBeNull();
    expect(normalizePhone('12345')).toBeNull();
    expect(normalizePhone('9'.repeat(20))).toBeNull();
  });

  it('refuses a leading zero, which is not a country code', () => {
    expect(normalizePhone('00919876543210')).toBeNull();
  });

  it('is idempotent — normalising twice changes nothing', () => {
    const once = normalizePhone('98765 43210');
    expect(normalizePhone(once)).toBe(once);
  });
});

describe('isIndianMobile', () => {
  it('accepts a real Indian mobile series', () => {
    for (const start of ['6', '7', '8', '9']) {
      expect(isIndianMobile(normalizePhone(`${start}876543210`))).toBe(true);
    }
  });

  it('rejects a landline series and a foreign number', () => {
    expect(isIndianMobile(normalizePhone('4412345678'))).toBe(false);
    expect(isIndianMobile(normalizePhone('+14155550123'))).toBe(false);
  });

  it('rejects null', () => {
    expect(isIndianMobile(null)).toBe(false);
  });
});
