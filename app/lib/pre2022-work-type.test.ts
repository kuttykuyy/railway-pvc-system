import { describe, expect, it } from 'vitest';
import { suggestPre2022WorkType } from './pre2022-work-type';
import { PRE_2022_WORK_TYPES } from './pvc-pre2022';

/** The work this clause was traced against — tender 367-DRM-W-GNT-TId-2433. */
const THIS_CONTRACT =
  'Provision of Subways (RUBs) by Open Cut Method in lieu of Manned Level Crossings at '
  + 'LC.No.50 & 46 in Guntur - Nadikudi Section';

describe('the contract this was built for', () => {
  const suggestion = suggestPre2022WorkType(THIS_CONTRACT);

  it('reads it as earthwork and ordinary bridges, not a major bridge', () => {
    expect(suggestion.workType).toBe('earthwork-bridges-ballast-tunnelling');
    expect(suggestion.confidence).toBe('firm');
  });

  it('picks the split that matches the work — heavy on plant and fuel', () => {
    // The schedules are formation cutting, launching precast boxes and sub-structure
    // concrete: machinery and diesel, not bought-in materials.
    const p = PRE_2022_WORK_TYPES[suggestion.workType].percentages;
    expect(p.plantMachinery).toBe(30);
    expect(p.fuel).toBe(25);
    expect(p.otherMaterial).toBe(10);
  });

  it('would have paid very differently as a major bridge', () => {
    // The reason this decision is made on evidence rather than on the word "bridge".
    const major = PRE_2022_WORK_TYPES['major-important-bridges'].percentages;
    expect(major.otherMaterial).toBe(30); // against 10
    expect(major.fuel).toBe(15); // against 25
  });
});

describe('telling a box structure from a major bridge', () => {
  it('keeps every kind of subway and RUB out of the major bridge column', () => {
    // These schedules say "bridge" on almost every line — "bridge for one track",
    // "bridge sub-structure", "shifting to bridge site" — while being box culverts.
    const wordings = [
      'Construction of RUB in lieu of level crossing',
      'Provision of Limited Height Subway (LHS) at LC No 12',
      'Launching of precast RCC box segments for RUBs/LHS of single or twin spans',
      'Construction of road underpass with box cell structure',
    ];
    for (const wording of wordings) {
      expect(suggestPre2022WorkType(wording).workType, wording).toBe('earthwork-bridges-ballast-tunnelling');
    }
  });

  it('uses the major bridge column only when the wording names one', () => {
    expect(suggestPre2022WorkType('Rebuilding of Major Bridge No. 247 across river Krishna').workType)
      .toBe('major-important-bridges');
    expect(suggestPre2022WorkType('Repairs to important bridge no 31').workType)
      .toBe('major-important-bridges');
  });

  it('does not promote an ordinary bridge just for saying bridge', () => {
    expect(suggestPre2022WorkType('Construction of minor bridge no 44 and approach earthwork').workType)
      .toBe('earthwork-bridges-ballast-tunnelling');
    expect(suggestPre2022WorkType('Rebuilding of bridge no 12 with RCC slab').workType)
      .toBe('earthwork-bridges-ballast-tunnelling');
  });
});

describe('the other work types', () => {
  it('finds tunnelling with explosives, the only type paying an explosives share', () => {
    const s = suggestPre2022WorkType('Tunnelling works involving controlled blasting with explosives');
    expect(s.workType).toBe('minor-tunnelling-explosives');
    expect(PRE_2022_WORK_TYPES[s.workType].percentages.explosives).toBe(20);
  });

  it('does not pay an explosives share for tunnelling that never mentions them', () => {
    const s = suggestPre2022WorkType('Tunnel approach earthwork and lining');
    expect(PRE_2022_WORK_TYPES[s.workType].percentages.explosives).toBe(0);
  });

  it('finds permanent way linking, which is paid mostly on labour', () => {
    const s = suggestPre2022WorkType('Through rail renewal and P-Way linking in Guntur division');
    expect(s.workType).toBe('permanent-way-linking');
    expect(PRE_2022_WORK_TYPES[s.workType].percentages.labour).toBe(50);
  });

  it('finds buildings', () => {
    expect(suggestPre2022WorkType('Construction of station building and staff quarters').workType).toBe('building');
  });

  it('does not call a subway a building, though its trades look like one', () => {
    // Concrete, shuttering and plaster appear in both. Order of testing decides this.
    expect(suggestPre2022WorkType('Subway construction including building works and plastering').workType)
      .toBe('earthwork-bridges-ballast-tunnelling');
  });

  it('finds plain earthwork and ballast supply', () => {
    expect(suggestPre2022WorkType('Supply of machine crushed track ballast').workType)
      .toBe('earthwork-bridges-ballast-tunnelling');
    expect(suggestPre2022WorkType('Earthwork in formation and embankment').workType)
      .toBe('earthwork-bridges-ballast-tunnelling');
  });
});

describe('saying so when it does not know', () => {
  it('asks for a human when there is no description', () => {
    const s = suggestPre2022WorkType('');
    expect(s.confidence).toBe('needs-checking');
    expect(s.reason).toMatch(/read the tender/i);
  });

  it('asks for a human when nothing matches', () => {
    const s = suggestPre2022WorkType('Annual maintenance of office air conditioning units');
    expect(s.workType).toBe('other-works-manual');
    expect(s.confidence).toBe('needs-checking');
  });

  it('always gives a reason worth showing on a screen', () => {
    for (const wording of [THIS_CONTRACT, 'Major bridge no 3', 'Station building', '']) {
      const s = suggestPre2022WorkType(wording);
      expect(s.reason.length).toBeGreaterThan(30);
      expect(s.label).toBe(PRE_2022_WORK_TYPES[s.workType].label);
    }
  });
});
