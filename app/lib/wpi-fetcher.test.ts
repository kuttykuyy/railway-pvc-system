import { describe, expect, it } from 'vitest';
import { WPI_MAPPINGS, findWPIDataForIndex, parseWPIExcelData, type WPIDataRow } from './wpi-fetcher';

describe('parseWPIExcelData — new-series text month headers', () => {
  // The 202608 workbook ships month headers as text ("Apr-26" …), not Excel serials.
  // Reading only serials/Dates found no month columns and every value came back N/A.
  const data: any[][] = [
    ['Level', 'Commodity Name', 'Commodity Code', 'Commodity Weight', 'Apr-26', 'May-26', 'Jun-26', 'Jul-26'],
    ['ALL', 'All Commodities', '1000000000', 100, 109, 110.1, 110.2, 110],
  ];

  it('detects the text month columns and reads values', () => {
    const rows = parseWPIExcelData(data);
    expect(rows).toHaveLength(1);
    expect(rows[0].series).toBe('new');
  });

  it('keeps only the months the new series owns (>= May 2026), dropping the recomputed back-series', () => {
    const [r] = parseWPIExcelData(data);
    const months = r.monthlyValues.map(v => v.month.toISOString().slice(0, 7));
    expect(months).toEqual(['2026-05', '2026-06', '2026-07']); // Apr-26 dropped
    expect(r.monthlyValues.find(v => v.month.toISOString().slice(0, 7) === '2026-07')?.value).toBe(110);
  });
});

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

  it('finds nothing for plates in the new series rather than taking a lookalike', () => {
    // The 2022-23 rebase abolished the 'Mild Steel - Flat products' sub-group the clause
    // names. Item 1314010029 'Mild steel (MS) flats & sheets' is in NEW_SERIES above and
    // must NOT be picked up: it carries 0.00115 of the basket against the old sub-group's
    // whole one, and rose while every bar and section row fell.
    expect(WPI_MAPPINGS['WPI Steel Flat Products'].newCode).toBe('');
    expect(findWPIDataForIndex('WPI Steel Flat Products', NEW_SERIES)).toBeNull();
  });

  it('has no mapping for other sections, because it is an average and not an index', () => {
    // Clause 46A.9(4) is the average of the other three, worked out at calculation time.
    expect(WPI_MAPPINGS['WPI Steel Other Sections']).toBeUndefined();
  });
});

/**
 * Rows from the final 2011-12 workbook (monthly_index_202606.xls), which carries
 * Apr 2012 - Apr 2026 — the series a pre-2022 contract's base month and most of its
 * quarters actually live on.
 */
const OLD_SERIES: WPIDataRow[] = [
  { ...row('1000000000', 'All commodities'), series: 'old' },
  { ...row('1200000000', 'II FUEL & POWER'), series: 'old' },
  { ...row('1313050000', 'e. Manufacture of cement, lime and plaster'), series: 'old' },
  { ...row('1314040000', 'd. Mild Steel -Long Products'), series: 'old' },
  { ...row('1314040002', 'MS Bright Bars'), series: 'old' },
  { ...row('1314040004', 'Angles, Channels, Sections, steel (coated/not)'), series: 'old' },
  { ...row('1314050000', 'e. Mild Steel - Flat products'), series: 'old' },
  { ...row('1318110000', 'k. Manufacture of machinery for mining, quarrying and construction'), series: 'old' },
];

describe('the old 2011-12 series, which pre-2022 contracts are based on', () => {
  it('finds each steel category the clause names', () => {
    expect(findWPIDataForIndex('WPI Steel Bright Bars', OLD_SERIES)?.commCode).toBe('1314040002');
    expect(findWPIDataForIndex('WPI Steel Angles & Channels', OLD_SERIES)?.commCode).toBe('1314040004');
    expect(findWPIDataForIndex('WPI Steel Flat Products', OLD_SERIES)?.commCode).toBe('1314050000');
  });

  it('takes plates from the sub-group, not its parent', () => {
    // 'd. Mild Steel -Long Products' sits right beside it and is the wrong basket.
    expect(findWPIDataForIndex('WPI Steel Flat Products', OLD_SERIES)?.commName).toMatch(/Flat products/);
  });

  it('finds fuel and the four GCC-2022 series too', () => {
    expect(findWPIDataForIndex('WPI Fuel & Power', OLD_SERIES)?.commCode).toBe('1200000000');
    expect(findWPIDataForIndex('RBI Cement', OLD_SERIES)?.commCode).toBe('1313050000');
    expect(findWPIDataForIndex('RBI Plant Machinery', OLD_SERIES)?.commCode).toBe('1318110000');
  });

  it('keeps the two series apart, because the rebase moved mild steel', () => {
    // Old mild steel sits under 13140400/13140500, new under 13140100. Matching a row
    // by the other series' code would pick a real row for a different commodity.
    expect(WPI_MAPPINGS['WPI Steel Bright Bars'].code).not.toBe(WPI_MAPPINGS['WPI Steel Bright Bars'].newCode);
    // The old bright-bars code must not resolve to anything in the new basket.
    expect(NEW_SERIES.some(r => r.commCode === WPI_MAPPINGS['WPI Steel Bright Bars'].code)).toBe(false);
  });

  it('leaves the GCC-2022 mappings exactly as they were, in the new series', () => {
    // These four price every current contract. Adding pre-2022 series must not disturb
    // which row any of them resolves to.
    expect(findWPIDataForIndex('RBI Other Materials', NEW_SERIES)?.commCode).toBe('1000000000');
    expect(WPI_MAPPINGS['RBI Cement'].newCode).toBe('1313050000');
    expect(WPI_MAPPINGS['RBI Plant Machinery'].newCode).toBe('1318120000');
    expect(WPI_MAPPINGS['RBI Explosives'].newCode).toBe('1315040001');
  });
});
