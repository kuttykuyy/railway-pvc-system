import { describe, it, expect } from 'vitest';
import { matchCementCoefficient, normalizeDsrCode } from './dsr-cement-calculation';

type Row = { dsrCode: string };

/** Builds the lookup exactly as the routes do: keyed by the normalized code. */
const lookup = (codes: string[]) =>
  new Map<string, Row>(codes.map((c) => [normalizeDsrCode(c), { dsrCode: c }]));

describe('matchCementCoefficient', () => {
  it('matches an exact code', () => {
    const map = lookup(['5.35']);
    expect(matchCementCoefficient(map, '5.35')?.dsrCode).toBe('5.35');
  });

  it('matches regardless of spacing/case formatting', () => {
    const map = lookup(['5.35']);
    expect(matchCementCoefficient(map, ' 5.35 ')?.dsrCode).toBe('5.35');
  });

  it('falls back to the base code for a lettered bill item', () => {
    // A bill item "5.35A" is covered by the coefficient stored for "5.35".
    const map = lookup(['5.35']);
    expect(matchCementCoefficient(map, '5.35A')?.dsrCode).toBe('5.35');
  });

  it('does NOT fall back across a numeric sub-code', () => {
    // Documents real behaviour: the base pattern is greedy, so "5.35.2" stays
    // "5.35.2" and does not borrow "5.35"'s coefficient. A deeper sub-item can be a
    // different work item, so this is deliberate — add "5.35.2" explicitly if needed.
    const map = lookup(['5.35']);
    expect(matchCementCoefficient(map, '5.35.2')).toBeNull();
  });

  it('prefers the exact code over the base code', () => {
    const map = lookup(['5.35', '5.35.2']);
    expect(matchCementCoefficient(map, '5.35.2')?.dsrCode).toBe('5.35.2');
  });

  it('returns null when nothing matches', () => {
    const map = lookup(['5.35']);
    expect(matchCementCoefficient(map, '9.99')).toBeNull();
  });

  it('returns null for an empty code', () => {
    expect(matchCementCoefficient(lookup(['5.35']), '')).toBeNull();
  });

  it('matches MIX- codes used for non-schedule concrete items', () => {
    const map = lookup(['MIX-1:2:4']);
    expect(matchCementCoefficient(map, 'MIX-1:2:4')?.dsrCode).toBe('MIX-1:2:4');
  });
});
