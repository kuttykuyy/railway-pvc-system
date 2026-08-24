import { describe, expect, it } from 'vitest';
import { phoneMatchCandidates } from './phone-owner';
import { normalizePhone } from './phone-validation';

/**
 * The candidate list is what makes a duplicate check see through the four ways one
 * number used to be stored. If it misses a form, two accounts keep the same mobile and
 * the WhatsApp bot is back to guessing which one you meant.
 */
describe('phoneMatchCandidates', () => {
  const candidates = phoneMatchCandidates('+919876543210');

  it('covers every form the same number was stored in before normalising', () => {
    for (const stored of ['+919876543210', '919876543210', '9876543210', '09876543210']) {
      expect(candidates).toContain(stored);
    }
  });

  it('finds a row no matter which form either side was written in', () => {
    // Whichever way a new signup types it, the normalised value's candidate list has
    // to contain whatever an older row happens to hold.
    const typed = ['9876543210', '+91 98765 43210', '919876543210', '098765 43210'];
    for (const entry of typed) {
      const list = phoneMatchCandidates(normalizePhone(entry)!);
      expect(list).toContain('919876543210');
      expect(list).toContain('9876543210');
    }
  });

  it('does not smear across different numbers', () => {
    expect(phoneMatchCandidates('+919876543210')).not.toContain('9876543211');
  });

  it('has no duplicates of its own', () => {
    expect(new Set(candidates).size).toBe(candidates.length);
  });
});
