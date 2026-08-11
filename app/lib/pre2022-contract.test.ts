import { describe, expect, it } from 'vitest';
import { resolvePre2022Setup } from './pre2022-contract';

/** Tender 367-DRM-W-GNT-TId-2433 — closed 20 Aug 2021, RUBs in lieu of level crossings. */
const THIS_CONTRACT = {
  dateOfOpening: '2021-08-20',
  workDescription: 'Provision of Subways (RUBs) by Open Cut Method in lieu of Manned Level Crossings at LC.No.50 & 46',
};

describe('the contract this was built for', () => {
  const setup = resolvePre2022Setup(THIS_CONTRACT);

  it('is on the old clause, from its tender date', () => {
    expect(setup.isPre2022).toBe(true);
    expect(setup.versionSource).toBe('tender-date');
  });

  it('lands on earthwork and bridges without anyone recording it', () => {
    expect(setup.workType).toBe('earthwork-bridges-ballast-tunnelling');
    expect(setup.workTypeSource).toBe('from-description');
  });

  it('is sure enough to price without stopping to ask', () => {
    expect(setup.needsDecision).toBe(false);
    expect(setup.decisionNeeded).toBe('');
  });

  it('still says on the statement that the old clause applies', () => {
    expect(setup.warning).toMatch(/older/i);
  });
});

describe('a recorded decision beats a worked-out one', () => {
  it('takes a recorded work type over the description', () => {
    const setup = resolvePre2022Setup({ ...THIS_CONTRACT, pre2022WorkType: 'major-important-bridges' });
    expect(setup.workType).toBe('major-important-bridges');
    expect(setup.workTypeSource).toBe('recorded');
    expect(setup.needsDecision).toBe(false);
  });

  it('takes a recorded GCC version over the tender date', () => {
    // A 2021 tender that a human has read and found to be on the 2022 clause.
    const setup = resolvePre2022Setup({ ...THIS_CONTRACT, gccVersion: 'gcc-2022' });
    expect(setup.isPre2022).toBe(false);
    expect(setup.versionSource).toBe('recorded');
    expect(setup.warning).toBe(''); // nothing left to warn about
    expect(setup.workType).toBeNull();
  });

  it('can put a later contract on the old clause when someone says so', () => {
    const setup = resolvePre2022Setup({
      dateOfOpening: '2022-09-01',
      workDescription: 'Earthwork in formation',
      gccVersion: 'pre-2022',
    });
    expect(setup.isPre2022).toBe(true);
    expect(setup.workType).toBe('earthwork-bridges-ballast-tunnelling');
  });

  it('ignores a stored value that is not one of the six', () => {
    const setup = resolvePre2022Setup({ ...THIS_CONTRACT, pre2022WorkType: 'something-else' });
    expect(setup.workTypeSource).toBe('from-description');
  });
});

describe('asking a human when it should', () => {
  it('asks which clause governs a tender from the changeover', () => {
    const setup = resolvePre2022Setup({ dateOfOpening: '2022-06-15', workDescription: 'Earthwork' });
    expect(setup.version).toBe('uncertain');
    expect(setup.needsDecision).toBe(true);
    expect(setup.decisionNeeded).toMatch(/read clause 46a/i);
  });

  it('asks which work type when the description says nothing useful', () => {
    const setup = resolvePre2022Setup({
      dateOfOpening: '2021-08-20',
      workDescription: 'Annual maintenance of office air conditioning',
    });
    expect(setup.isPre2022).toBe(true);
    expect(setup.needsDecision).toBe(true);
    expect(setup.decisionNeeded).toMatch(/check the tender/i);
  });

  it('asks when there is no work description at all', () => {
    const setup = resolvePre2022Setup({ dateOfOpening: '2021-08-20' });
    expect(setup.needsDecision).toBe(true);
  });
});

describe('leaving current contracts alone', () => {
  it('says nothing at all about a 2025 tender', () => {
    const setup = resolvePre2022Setup({
      dateOfOpening: '2025-03-11',
      workDescription: 'Provision of RUB in lieu of level crossing',
    });
    expect(setup.isPre2022).toBe(false);
    expect(setup.warning).toBe('');
    expect(setup.needsDecision).toBe(false);
    expect(setup.workType).toBeNull();
  });

  it('treats a missing tender date as an ordinary current contract', () => {
    const setup = resolvePre2022Setup({ dateOfOpening: null, workDescription: 'Earthwork' });
    expect(setup.isPre2022).toBe(false);
    expect(setup.needsDecision).toBe(false);
  });
});
