import { describe, expect, it } from 'vitest';
import { gccVersionForTenderDate } from './gcc-version';

describe('gccVersionForTenderDate', () => {
  it('calls a 2021 tender pre-2022 and says what the app gets wrong', () => {
    // Tender 367-DRM-W-GNT-TId-2433, closing 20/08/2021 — the agreement read to
    // establish the differences.
    const verdict = gccVersionForTenderDate('2021-08-20');
    expect(verdict.version).toBe('pre-2022');
    expect(verdict.warning).toMatch(/older/i);
    expect(verdict.warning).toMatch(/20 Aug 2021/);
  });

  it('calls a 2025 tender GCC-2022 and warns about nothing', () => {
    const verdict = gccVersionForTenderDate('2025-11-17');
    expect(verdict.version).toBe('gcc-2022');
    expect(verdict.warning).toBe('');
  });

  it('refuses to decide either way around the changeover', () => {
    const verdict = gccVersionForTenderDate('2022-06-15');
    expect(verdict.version).toBe('uncertain');
    expect(verdict.warning).toMatch(/read Clause 46A/i);
  });

  it('assumes nothing is wrong when there is no date to judge by', () => {
    expect(gccVersionForTenderDate(null).version).toBe('gcc-2022');
    expect(gccVersionForTenderDate(undefined).warning).toBe('');
    expect(gccVersionForTenderDate('not a date').version).toBe('gcc-2022');
  });
});
