import { describe, expect, it } from 'vitest';
import { enforceSteelSubclassNature } from './work-classification';

/**
 * The deterministic B→D guard, tested against the three REAL items an AI run put in 5B:
 * DSR 5.22.6 (TMT reinforcement — B is right) and DSR 10.2 / 10.19 (structural trusses
 * and MS holding-down bolts — must be D).
 */
describe('enforceSteelSubclassNature', () => {
  it('keeps genuine TMT reinforcement supply in …B (DSR 5.22.6)', () => {
    expect(enforceSteelSubclassNature('5B',
      'Supply and fixing of TMT steel reinforcement bars for RCC work including straightening, cutting, bending, placing in position and binding')).toBe('5B');
  });

  it('moves structural steel work to …D (DSR 10.2)', () => {
    expect(enforceSteelSubclassNature('5B',
      'Structural steel work in built-up sections, trusses and framed work, including cutting, hoisting, fixing in position')).toBe('5D');
  });

  it('moves mild steel holding-down bolts to …D (DSR 10.19)', () => {
    expect(enforceSteelSubclassNature('5B',
      'Providing and fixing mild steel round holding down bolts with nuts and washers')).toBe('5D');
  });

  it('never touches non-B codes or steel-free items', () => {
    expect(enforceSteelSubclassNature('5A', 'Structural steel trusses')).toBe('5A');
    expect(enforceSteelSubclassNature('5D', 'MS bolts')).toBe('5D');
    expect(enforceSteelSubclassNature('5B', 'Supplying steel for the work')).toBe('5B'); // no non-TMT evidence
    expect(enforceSteelSubclassNature('', 'anything')).toBe('');
  });

  it('works for any group digit', () => {
    expect(enforceSteelSubclassNature('1B', 'Fabrication and erection of MS angles and channels')).toBe('1D');
  });

  // Reverse direction: TMT reinforcement wrongly put in …D must come back to …B.
  it('moves a TMT reinforcement item out of …D into …B (DSR 5.22.6 miscoded)', () => {
    expect(enforceSteelSubclassNature('5D',
      'Supply and fixing of TMT steel reinforcement bars for RCC work including cutting, bending, placing in position and binding')).toBe('5B');
  });

  it('moves Fe500 reinforcement bars out of …D into …B', () => {
    expect(enforceSteelSubclassNature('5D',
      'Steel reinforcement Fe 500 for RCC, cut bent and placed in position')).toBe('5B');
  });

  it('keeps genuine structural fabrication in …D (not moved to B)', () => {
    expect(enforceSteelSubclassNature('5D',
      'Structural steel work in built-up sections, trusses and framed work, fabrication and erection')).toBe('5D');
    expect(enforceSteelSubclassNature('5D', 'Providing and fixing mild steel holding down bolts')).toBe('5D');
    expect(enforceSteelSubclassNature('5D', 'Fabrication and erection of MS angles and channels')).toBe('5D');
  });

  it('leaves a …D item with no steel wording alone', () => {
    expect(enforceSteelSubclassNature('5D', 'Some general work item')).toBe('5D');
  });

  // The real regression from the screenshot: DSR 5.22.6 reinforcement whose description
  // carries the WHOLE DSR clause dump, including "5.22A.1 Mild steel and Medium Tensile
  // steel bars". Reinforcement must win over that incidental "mild steel".
  const DSR_5226_DUMP =
    'Steel reinforcement for R.C.C. work including straightening, cutting, bending, placing in position and binding all complete upto plinth level. — Thermo-Mechanically Treated bars of grade Fe-500D or more. 5.22A Steel reinforcement for R.C.C. work ... 5.22A.1 Mild steel and Medium Tensile steel bars 5.22A.2 Hard drawn steel wire 5.22A.3 Cold twisted bars 5.22A.4 Hot rolled deformed bars 5.22A.5 Hard drawn steel wire fabric 5.22A.6 Thermo-Mechanically Treated bars of grade Fe-500D or more. 5.22B Steel reinforcement ... ready to use "cut and bend" rebars of approved make from factory/workshop to construction site ...';
  it('reinforcement wins over the DSR clause dump (5.22.6 in …D -> …B)', () => {
    expect(enforceSteelSubclassNature('5D', DSR_5226_DUMP)).toBe('5B');
  });
  it('reinforcement wins over the DSR clause dump (5.22.6 correctly in …B stays …B)', () => {
    expect(enforceSteelSubclassNature('5B', DSR_5226_DUMP)).toBe('5B');
  });
});
