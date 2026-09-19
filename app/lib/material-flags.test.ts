import { describe, expect, it } from 'vitest';
import { materialFlags } from './ireps-direct-pdf-parser';

/** The steel and cement detection every bill goes through — PDF or spreadsheet. */
describe('materialFlags', () => {
  it('reads TMT and structural steel', () => {
    expect(materialFlags('Thermo-Mechanically Treated bars of grade Fe-500D or more')).toMatchObject({ isSteelItem: true, steelType: 'TMT' });
    const structural = materialFlags('Structural steel work riveted, bolted or welded in built up sections, trusses and framed work');
    expect(structural.isSteelItem).toBe(true);
    expect(structural.steelTypes).toEqual(['ANGLE_CHANNEL', 'PLATES', 'OTHER_SECTIONS']);
  });

  it('reads reinforcement written any of the ways bills write it', () => {
    for (const wording of ['HYSD bars of grade Fe-415', 'Supply of rebars', 'Deformed bars for RCC work', 'TOR steel Fe 550 bars']) {
      const flags = materialFlags(wording);
      expect(flags.isSteelItem, wording).toBe(true);
    }
    expect(materialFlags('HYSD bars of grade Fe-415').steelType).toBe('TMT');
    expect(materialFlags('Deformed bars for RCC work').steelType).toBe('TMT');
  });

  it('reads rolled sections the schedules name by their section code', () => {
    // DSR 15.17 and USSOR 195010 / 195020, as printed.
    expect(materialFlags('R.S. Joists of any section').steelTypes).toContain('ANGLE_CHANNEL');
    expect(materialFlags('Galvanized Steel Channel Sleepers made from ISMC 150mm x 75mm standard rolled section').steelTypes).toContain('ANGLE_CHANNEL');
    expect(materialFlags('Galvanized H-beam Sleepers made out of standard Rolled sections conforming to IS 2062').steelTypes).toContain('ANGLE_CHANNEL');
    expect(materialFlags('Steel work in built up sections with purlins and framed work').steelTypes).toContain('PLATES');
  });

  it('does not read a concrete item as steel because its note says reinforcement is paid extra', () => {
    // USSOR 024010, as printed.
    const flags = materialFlags(
      'Providing and casting machine batched, machine mixed and machine vibrated Cement Concrete of specified grade as per approved Design Mix '
      + 'in bottom/top slab, side walls of RCC box. Note: 1. Payment for cement, reinforcement and shuttering shall be made extra under relevant item.',
    );
    expect(flags.isSteelItem).toBe(false);
    expect(flags.steelType).toBe('');
    // Its cement is paid under the cement supply item, so it is not sought here either.
    expect(flags.isCementAffected).toBe(false);
  });

  it('does not read box pushing as cement-affected when RCC and cement are paid extra', () => {
    const flags = materialFlags(
      'Casting and installation of single/twin RCC box of all sizes by box pushing technique. Note: 1. The rate includes all items of work for complete job '
      + 'in all respects except "cost of Reinforced cement concrete, cement, reinforcement & shuttering" of (i) main RCC Box; (ii) Thrust Bed, which shall be paid extra under relevant items of USSOR.',
    );
    expect(flags.isSteelItem).toBe(false);
    expect(flags.isCementAffected).toBe(false);
  });

  it('keeps the steel on an item whose note only pays for the FITTINGS separately', () => {
    // USSOR 195020, as printed: the sleeper itself is steel, billed by the tonne.
    const flags = materialFlags(
      'Miscellaneous Fabrication & supply of Galvanized H-beam Sleepers made out of the materials confirming to IS 2062 of standard Rolled sections '
      + 'as per approved drawing Nos RDSO/B/1636/4/R,5&9 complete and directed by Engineer-in charge. Note: Cost of steel fittings and GRSP shall be paid separately.',
    );
    expect(flags.isSteelItem).toBe(true);
  });

  it('does not read demolition as steel', () => {
    expect(materialFlags('Demolishing R.C.C. work manually/ by mechanical means including stacking of steel bars').isSteelItem).toBe(false);
  });

  it('still reads a plain concrete item as cement-affected', () => {
    expect(materialFlags('1:2:4 (1 cement : 2 coarse sand (zone-III) : 4 graded stone aggregate 20 mm nominal size)').isCementAffected).toBe(true);
  });

  it('keeps the railway-supplied rule', () => {
    expect(materialFlags('Driving rails 90R/52 Kg section below ground level. Payment will be made as per actual driven length of rail which will be supplied free by Railways at the site of work.').isSteelItem).toBe(false);
  });
});
