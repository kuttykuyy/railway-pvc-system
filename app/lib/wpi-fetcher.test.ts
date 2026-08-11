import { describe, expect, it } from 'vitest';
import { WPI_MAPPINGS, findWPIDataForIndex, type WPIDataRow } from './wpi-fetcher';

/**
 * Rows copied from the real new-series workbook (wpi_monthly_index_202607.xlsx, base
 * 2022-23), including the near-misses. The point of these tests is not that the code
 * finds *a* row — it is that it finds the right one when a wrong one is sitting next to
 * it wearing a similar name.
 */
const row = (commCode: string, commName: string): WPIDataRow => ({
  series: 'new',
  commCode,
  commName,
  commWeight: 1,
  monthlyValues: [{ month: new Date(Date.UTC(2023, 3, 1)), value: 100 }],
});

const NEW_SERIES: WPIDataRow[] = [
  row('1000000000', 'All Commodities'),
  row('1200000000', 'II FUEL & POWER'),
  row('1202000000', '(B). MINERAL OILS'),
  row('1203000000', '(C). ELECTRICITY'),
  row('1314000000', '(N).MANUFACTURE OF BASIC METALS'),
  row('1314010000', 'a.Manufacture of basic iron and steel'),
  row('1314010014', 'Bars and Rods of Mild steel'),
  row('1314010016', 'Mild Steel Bright Rectangular Bars'),
  row('1314010019', 'Hot-Rolled Structural Angles, Shapes, Sections, Beams, Channels, and Girders of Iron and Non-Alloy Steel'),
  row('1314010029', 'Mild steel (MS) flats & sheets'),
  row('1315050002', 'Angles, shapes, sections forged'),
];

describe('pre-2022 GCC index mappings', () => {
  it('takes fuel from the whole Fuel & Power group, not one of its parts', () => {
    // The clause says the group. Mineral Oils alone would track diesel and defeat the
    // point of the pre-2022 clause differing from GCC-2022 in the first place.
    const match = findWPIDataForIndex('WPI Fuel & Power', NEW_SERIES);
    expect(match?.commCode).toBe('1200000000');
  });

  it('reads bright bars as the commodity Cl.46A.9(1) names', () => {
    const match = findWPIDataForIndex('WPI Steel Bright Bars', NEW_SERIES);
    expect(match?.commCode).toBe('1314010016');
    expect(match?.commName).toMatch(/Bright/);
  });

  it('reads angles from the hot-rolled structural row, not the forged one', () => {
    // 1315050002 'Angles, shapes, sections forged' matches the clause's wording more
    // closely word-for-word, and is a different product made a different way.
    const match = findWPIDataForIndex('WPI Steel Angles & Channels', NEW_SERIES);
    expect(match?.commCode).toBe('1314010019');
  });

  it('has no mapping for plates or other sections, so neither can be filled by mistake', () => {
    // The 2022-23 rebase abolished the 'Mild Steel - Flat Products' sub-group the clause
    // names. Until a defensible row exists these are entered by hand; an accidental
    // mapping would price plate items on a 0.00115-weight row moving the other way.
    expect(WPI_MAPPINGS['WPI Steel Flat Products']).toBeUndefined();
    expect(WPI_MAPPINGS['WPI Steel Other Sections']).toBeUndefined();
    expect(findWPIDataForIndex('WPI Steel Flat Products', NEW_SERIES)).toBeNull();
  });

  it('will not match a pre-2022 series on an unverified old code', () => {
    // Old-series codes are unknown (the 2011-12 archive is offline) and are stored
    // empty. Matching must fall through to the name, so an old workbook whose codes were
    // reassigned cannot silently supply a different commodity's numbers.
    for (const name of ['WPI Fuel & Power', 'WPI Steel Bright Bars', 'WPI Steel Angles & Channels']) {
      expect(WPI_MAPPINGS[name].code).toBe('');
    }
    const oldWorkbook: WPIDataRow[] = [{ ...row('1200000000', 'Some Reassigned Commodity'), series: 'old' }];
    expect(findWPIDataForIndex('WPI Fuel & Power', oldWorkbook)).toBeNull();
  });

  it('matches an old workbook on the clause wording when the name is right', () => {
    const oldWorkbook: WPIDataRow[] = [{ ...row('1200000000', 'FUEL & POWER'), series: 'old' }];
    expect(findWPIDataForIndex('WPI Fuel & Power', oldWorkbook)?.commName).toBe('FUEL & POWER');
  });

  it('leaves the GCC-2022 mappings exactly as they were', () => {
    // These four price every current contract. Adding pre-2022 series must not disturb
    // which row any of them resolves to.
    expect(findWPIDataForIndex('RBI Other Materials', NEW_SERIES)?.commCode).toBe('1000000000');
    expect(WPI_MAPPINGS['RBI Cement'].newCode).toBe('1313050000');
    expect(WPI_MAPPINGS['RBI Plant Machinery'].newCode).toBe('1318120000');
    expect(WPI_MAPPINGS['RBI Explosives'].newCode).toBe('1315040001');
  });
});
