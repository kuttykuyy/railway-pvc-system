import { describe, expect, it } from 'vitest';
import { defaultLanguageForZone, defaultLanguageForCpwdRegion } from './zone-language';

describe('defaultLanguageForZone', () => {
  it('defaults Hindi-belt and western/central railway zones to Hindi', () => {
    for (const z of ['NR', 'NCR', 'NER', 'NWR', 'WCR', 'ECR', 'SECR', 'CR', 'WR']) {
      expect(defaultLanguageForZone(z)).toBe('hi');
    }
  });

  it('defaults southern, eastern and NE zones to English', () => {
    for (const z of ['SR', 'SCR', 'SWR', 'SER', 'ER', 'NFR', 'KRCL']) {
      expect(defaultLanguageForZone(z)).toBe('en');
    }
  });

  it('is case- and space-insensitive, and safe on empty input', () => {
    expect(defaultLanguageForZone(' ncr ')).toBe('hi');
    expect(defaultLanguageForZone(null)).toBe('en');
    expect(defaultLanguageForZone('')).toBe('en');
  });
});

describe('defaultLanguageForCpwdRegion', () => {
  it('maps Hindi-city regions to Hindi', () => {
    expect(defaultLanguageForCpwdRegion('delhi-ncr')).toBe('hi');
    expect(defaultLanguageForCpwdRegion('Lucknow')).toBe('hi');
  });
  it('maps other regions to English', () => {
    expect(defaultLanguageForCpwdRegion('chennai')).toBe('en');
    expect(defaultLanguageForCpwdRegion(null)).toBe('en');
  });
});
