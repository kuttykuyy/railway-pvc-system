import { describe, it, expect } from 'vitest';
import { parseAgreementNumber, agreementMatchesZone } from './railway-division-helper';

describe('parseAgreementNumber', () => {
  it('extracts the zone from a standard agreement number', () => {
    expect(parseAgreementNumber('SR/TPJ/Civil/2025/0067')?.zone).toBe('SR');
    expect(parseAgreementNumber('NR/DLI/Elec/2024/12')?.zone).toBe('NR');
  });

  it('uppercases the zone', () => {
    expect(parseAgreementNumber('sr/tpj/civil/2025/0067')?.zone).toBe('SR');
  });

  it('returns null for malformed / too-short agreement numbers', () => {
    expect(parseAgreementNumber('AB')).toBeNull();
    expect(parseAgreementNumber('SR/TPJ')).toBeNull();
    expect(parseAgreementNumber('')).toBeNull();
  });
});

describe('agreementMatchesZone (railway-official authorization predicate)', () => {
  it('matches when the agreement zone equals the official zone', () => {
    expect(agreementMatchesZone('SR/TPJ/Civil/2025/0067', 'SR')).toBe(true);
  });

  it('is case-insensitive on both sides', () => {
    expect(agreementMatchesZone('sr/tpj/civil/x', 'SR')).toBe(true);
    expect(agreementMatchesZone('SR/TPJ/Civil/x', 'sr')).toBe(true);
  });

  it('does NOT match a different zone (no cross-zone access)', () => {
    expect(agreementMatchesZone('SR/TPJ/Civil/x', 'CR')).toBe(false);
    // prefix-lookalike must not match (e.g. SRX is not SR)
    expect(agreementMatchesZone('SRX/TPJ/Civil/x', 'SR')).toBe(false);
  });

  it('returns false for nullish inputs or unparseable agreements', () => {
    expect(agreementMatchesZone('SR/TPJ/Civil/x', null)).toBe(false);
    expect(agreementMatchesZone(null, 'SR')).toBe(false);
    expect(agreementMatchesZone(undefined, undefined)).toBe(false);
    expect(agreementMatchesZone('AB', 'AB')).toBe(false); // too short -> null -> false
  });
});
