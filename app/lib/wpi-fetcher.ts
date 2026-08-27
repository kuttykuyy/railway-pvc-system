import { logger } from './logger';
/**
 * WPI Data Fetcher - Fetches Wholesale Price Index data from eaindustry.nic.in
 * Base Year: 2011-12 = 100
 */

import { prisma } from './db';
import { WPI_NEW_SERIES_FROM } from './wpi-series';

// WPI commodity codes mapping to our price indices.
//
// Two series, two sets of codes: the 2022-23 rebase of June 2026 rebuilt the item
// basket, and with it two of our four codes changed (machinery moved from k. to l. and
// took a new code; "Explosive" became "Explosives & Defense Ammunition" under a new
// group). `code`/`wpiName` identify the row in old-series workbooks, `newCode`/
// `newWpiName` in new-series ones — verified against the July 2026 workbook itself.
export const WPI_MAPPINGS: Record<string, { code: string; name: string; wpiName: string; newCode: string; newWpiName: string; newComposite?: string[] }> = {
  'RBI Cement': {
    code: '1313050000',
    name: 'RBI Cement',
    wpiName: 'e. Manufacture of cement, lime and plaster',
    newCode: '1313050000',
    newWpiName: 'e.Manufacture of cement, lime and plaster'
  },
  'RBI Plant Machinery': {
    code: '1318110000',
    name: 'RBI Plant Machinery',
    wpiName: 'k. Manufacture of machinery for mining, quarrying and construction',
    newCode: '1318120000',
    newWpiName: 'l.Manufacture of machinery for mining, quarrying and construction'
  },
  'RBI Explosives': {
    code: '1310070011',
    name: 'RBI Explosives',
    wpiName: 'Explosive',
    newCode: '1315040001',
    newWpiName: 'Explosives & Defense Ammunition'
  },
  'RBI Other Materials': {
    code: '1000000000',
    name: 'RBI Other Materials',
    wpiName: 'All commodities',
    newCode: '1000000000',
    newWpiName: 'All Commodities'
  },

  // The four below serve pre-2022 GCC contracts only. That clause prices fuel on the
  // WPI Fuel & Power group rather than the PPAC diesel price, and steel on WPI mild
  // steel per its Clause 46A.9 rather than JPC ex-works rates — so these have no bearing
  // on a GCC-2022 contract, which keeps using 'MPNG Fuel' and the 'Steel *' JPC indices.
  //
  // Every old-series code below was read out of the final 2011-12 workbook itself
  // (indx_download_1112/monthly_index_202606.xls, which carries Apr 2012 - Apr 2026),
  // not inferred from the new basket. That matters because the 2022-23 rebase moved all
  // of them: mild steel sat under group 13140400/13140500 in the old series and under
  // 13140100 in the new, so a code carried across unchanged would match a real row for a
  // different commodity and quietly price the contract on it.
  'WPI Fuel & Power': {
    code: '1200000000',
    name: 'WPI Fuel & Power',
    wpiName: 'II FUEL & POWER',
    newCode: '1200000000',
    newWpiName: 'II FUEL & POWER'
  },
  // Clause 46A.9(1): reinforcement bars and other rounds.
  'WPI Steel Bright Bars': {
    code: '1314040002',
    name: 'WPI Steel Bright Bars',
    wpiName: 'MS Bright Bars',
    newCode: '1314010016',
    newWpiName: 'Mild Steel Bright Rectangular Bars'
  },
  // Clause 46A.9(2): all types and sizes of angles, channels and joists.
  'WPI Steel Angles & Channels': {
    code: '1314040004',
    name: 'WPI Steel Angles & Channels',
    wpiName: 'Angles, Channels, Sections, steel (coated/not)',
    newCode: '1314010019',
    newWpiName: 'Hot-Rolled Structural Angles, Shapes, Sections, Beams, Channels, and Girders of Iron and Non-Alloy Steel'
  },
  // Clause 46A.9(3): all types and sizes of plates — the old sub-group 'e. Mild Steel -
  // Flat products' (1314050000), which carried the whole flat-products basket.
  //
  // The 2022-23 rebase abolished that single sub-group and scattered flat products across
  // several items. No ONE new item is a fair stand-in — item 1314010029 alone carries a
  // weight of 0.00115 and moves opposite to real plate steel, so substituting it would
  // misprice every plate item (and, via 46A.9(4)'s average, other sections too).
  //
  // The faithful replacement is therefore a COMPOSITE: the weight-weighted average of the
  // mild-steel flat-rolled items — HR coils/sheets/strips, HR plates, CR coils/sheets/
  // strips, cold-finished flat-rolled, and MS flats & sheets. Weights are read from the
  // workbook itself (each item's own weight), so the dominant HR coils drive it just as
  // they dominate the old aggregate. Coated (GP/GC) and stainless are excluded — the old
  // index was mild-steel flat products, not coated or alloy. Built only from new-series
  // rows (>= May 2026); an old-series import still matches the single 1314050000 row.
  'WPI Steel Flat Products': {
    code: '1314050000',
    name: 'WPI Steel Flat Products',
    wpiName: 'e. Mild Steel - Flat products',
    newCode: '',
    newWpiName: 'mild-steel flat products (composite)',
    newComposite: ['1314010010', '1314010011', '1314010012', '1314010020', '1314010029'],
  }

  // Clause 46A.9(4) — any other section — is not an index at all. It is the average of
  // the three above, worked out at calculation time, so there is nothing here to fetch.
};

// Parse INDX column name to date
function parseIndexColumn(colName: string): Date | null {
  // Format: INDXMMYYYY (e.g., INDX122025 = December 2025)
  const match = colName.match(/^INDX(\d{2})(\d{4})$/);
  if (!match) return null;
  
  const month = parseInt(match[1], 10);
  const year = parseInt(match[2], 10);
  
  if (month < 1 || month > 12) return null;
  
  // Return first day of month in UTC
  return new Date(Date.UTC(year, month - 1, 1));
}

// Parse Excel row to extract index values
export interface WPIDataRow {
  /** Which series this row came from — codes are only meaningful within their own series. */
  series?: 'old' | 'new';
  commName: string;
  commCode: string;
  commWeight: number;
  monthlyValues: { month: Date; value: number }[];
}

/** Excel's day count since 1899-12-30, which some new-series workbooks used as headers. */
function excelSerialToDate(serial: number): Date | null {
  if (!isFinite(serial) || serial < 20000 || serial > 80000) return null;
  const date = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
  // Normalize to the first of the month — the headers are month markers.
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

const MONTH_ABBR = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/**
 * A text month header the new-series workbook actually ships, e.g. "Apr-23" or "May-2026"
 * (also "Apr 23", "Apr'26"). The 202608 file headers come through as these strings, not
 * Excel serials — reading only serials/Dates found no month columns and every value read
 * N/A. A 2-digit year is read as 2000+YY.
 */
function parseMonthLabel(label: string): Date | null {
  const m = label.trim().match(/^([A-Za-z]{3,9})[\s'\-\/.]+(\d{2}|\d{4})$/);
  if (!m) return null;
  const monIdx = MONTH_ABBR.indexOf(m[1].slice(0, 3).toLowerCase());
  if (monIdx < 0) return null;
  let year = parseInt(m[2], 10);
  if (year < 100) year += 2000;
  return new Date(Date.UTC(year, monIdx, 1));
}

export function parseWPIExcelData(data: any[][]): WPIDataRow[] {
  if (!data || data.length < 2) return [];

  const headers = data[0] as any[];
  const result: WPIDataRow[] = [];

  // Two workbook generations. Old series (base 2011-12): columns are
  // [name, code, weight, INDXMMYYYY...]. New series (base 2022-23, June 2026 onward):
  // columns are [Level, Commodity Name, Commodity Code, Commodity Weight, <Excel date
  // serials>...]. The header row says which this is.
  const isNewLayout = headers.some(h => typeof h === 'string' && /commodity\s*code/i.test(h));
  const nameCol = isNewLayout ? 1 : 0;
  const codeCol = isNewLayout ? 2 : 1;
  const weightCol = isNewLayout ? 3 : 2;

  // Find column indices for monthly data
  const monthColumns: { index: number; date: Date }[] = [];
  headers.forEach((header, idx) => {
    if (typeof header === 'string' && header.startsWith('INDX')) {
      const date = parseIndexColumn(header);
      if (date) monthColumns.push({ index: idx, date });
    } else if (isNewLayout && typeof header === 'number') {
      const date = excelSerialToDate(header);
      if (date) monthColumns.push({ index: idx, date });
    } else if (isNewLayout && header instanceof Date) {
      monthColumns.push({ index: idx, date: new Date(Date.UTC(header.getUTCFullYear(), header.getUTCMonth(), 1)) });
    } else if (isNewLayout && typeof header === 'string') {
      // The month headers actually ship as text ("Apr-23" … "Jul-26"), not serials/Dates.
      const date = parseMonthLabel(header);
      if (date) monthColumns.push({ index: idx, date });
    }
  });

  // Parse each data row
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row || !row[nameCol]) continue;

    const commName = String(row[nameCol] || '').trim();
    const commCode = String(row[codeCol] || '').trim();
    const commWeight = parseFloat(row[weightCol]) || 0;

    const monthlyValues: { month: Date; value: number }[] = [];

    for (const col of monthColumns) {
      const value = parseFloat(row[col.index]);
      if (isNaN(value) || value <= 0) continue;
      // The new-series workbook carries the whole back-series RECOMPUTED on the new
      // base, from April 2023. Importing those would overwrite three years of stored
      // old-series history with numbers on a different base — silently corrupting
      // every contract whose base month sits in it (the calculation bridge assumes
      // stored pre-June-2026 values are old-series). New-series workbooks therefore
      // contribute only the months the new series actually owns.
      if (isNewLayout && col.date.getTime() < WPI_NEW_SERIES_FROM.getTime()) continue;
      monthlyValues.push({ month: col.date, value });
    }

    if (commName && commCode && monthlyValues.length > 0) {
      result.push({ commName, commCode, commWeight, monthlyValues, series: isNewLayout ? 'new' : 'old' });
    }
  }

  return result;
}

/**
 * Build a synthetic row for a composite index — the weight-weighted average, month by
 * month, of its member new-series rows. Each member's own workbook weight is the weight;
 * a month is included when at least one member carries it. Used for WPI Steel Flat
 * Products, which the new series has no single row for. Returns null if no member is found.
 */
function buildCompositeRow(memberCodes: string[], newRows: WPIDataRow[]): WPIDataRow | null {
  const members = newRows.filter(r => memberCodes.includes(r.commCode) && r.commWeight > 0);
  if (members.length === 0) return null;

  // month → { weightedSum, weight }
  const acc = new Map<number, { ws: number; w: number }>();
  for (const m of members) {
    for (const mv of m.monthlyValues) {
      const key = mv.month.getTime();
      const cur = acc.get(key) || { ws: 0, w: 0 };
      cur.ws += mv.value * m.commWeight;
      cur.w += m.commWeight;
      acc.set(key, cur);
    }
  }
  const monthlyValues = [...acc.entries()]
    .filter(([, v]) => v.w > 0)
    .map(([month, v]) => ({ month: new Date(month), value: Math.round((v.ws / v.w) * 10) / 10 }))
    .sort((a, b) => a.month.getTime() - b.month.getTime());
  if (monthlyValues.length === 0) return null;

  return {
    series: 'new',
    commCode: 'COMPOSITE',
    commName: 'Mild-steel flat products (composite)',
    commWeight: members.reduce((s, m) => s + m.commWeight, 0),
    monthlyValues,
  };
}

// Find matching WPI data for our indices
export function findWPIDataForIndex(
  indexName: string,
  wpiData: WPIDataRow[]
): WPIDataRow | null {
  const mapping = WPI_MAPPINGS[indexName];
  if (!mapping) return null;

  // A new-series index with no single equivalent is a composite: average its member rows.
  // Only when new-series data is present — an old-series import still uses the single code
  // below (the old sub-group row exists there), so historical imports are unchanged.
  if (mapping.newComposite) {
    const newRows = wpiData.filter(r => r.series === 'new');
    if (newRows.length > 0) {
      const composite = buildCompositeRow(mapping.newComposite, newRows);
      if (composite) return composite;
    }
  }

  // A code only means anything within its own series: the 2022-23 rebase reassigned
  // codes, and our OLD machinery code now belongs to a different commodity (metallurgy
  // machinery) in the new basket. Matching either code blindly picks that wrong row —
  // so each row is matched by the code of the series it came from.
  const codeFor = (row: WPIDataRow) => (row.series === 'new' ? mapping.newCode : mapping.code);
  let match = wpiData.find(row => row.commCode === codeFor(row));
  if (match) return match;

  // Fallback to name matching, against the spelling of the row's own series
  match = wpiData.find(row => {
    const expected = (row.series === 'new' ? mapping.newWpiName : mapping.wpiName).toLowerCase();
    const rowName = row.commName.toLowerCase();
    return rowName.includes(expected) || expected.includes(rowName);
  });

  return match || null;
}

/**
 * The rule the whole indices table depends on: of all the months a WPI-mapped index
 * holds ANY value for, the two most recent are provisional and every earlier one is
 * final. The WPI cron enforces this every time it runs — but a manual entry, a bulk
 * paste, or a spreadsheet import writes straight to the same table and has no reason
 * to know the rule exists, so any of them can add May and June as final while March
 * and April sit un-reclassified from whenever cron last saw them as the latest two.
 * The result is backwards: the newest data reads as settled and older data still
 * shows the provisional badge.
 *
 * Computed from the database as it stands right now, not from whatever file or
 * request triggered the call — so it corrects drift from ANY source, not just its own.
 */
export async function reapplyWpiProvisionalRule(): Promise<{
  latestMonths: string[];
  markedProvisional: number;
  markedFinal: number;
}> {
  const wpiIndices = await prisma.priceIndex.findMany({
    where: { name: { in: Object.keys(WPI_MAPPINGS) } },
    select: { id: true },
  });
  const ids = wpiIndices.map(i => i.id);
  if (ids.length === 0) return { latestMonths: [], markedProvisional: 0, markedFinal: 0 };

  const distinctMonths = await prisma.monthlyIndexValue.findMany({
    where: { priceIndexId: { in: ids } },
    select: { month: true },
    distinct: ['month'],
    orderBy: { month: 'desc' },
  });
  const latest2 = distinctMonths.slice(0, 2).map(r => r.month);
  if (latest2.length === 0) return { latestMonths: [], markedProvisional: 0, markedFinal: 0 };

  const toProvisional = await prisma.monthlyIndexValue.updateMany({
    where: { priceIndexId: { in: ids }, month: { in: latest2 }, isProvisional: false },
    data: { isProvisional: true, updatedAt: new Date() },
  });
  const toFinal = await prisma.monthlyIndexValue.updateMany({
    where: { priceIndexId: { in: ids }, month: { notIn: latest2 }, isProvisional: true },
    data: { isProvisional: false, updatedAt: new Date() },
  });

  return {
    latestMonths: latest2.map(d => d.toISOString().slice(0, 7)),
    markedProvisional: toProvisional.count,
    markedFinal: toFinal.count,
  };
}

// Update database with WPI values
export async function updateIndicesFromWPI(
  wpiData: WPIDataRow[],
  isProvisional: boolean = false,
  monthsToUpdate?: Date[]
): Promise<{
  success: boolean;
  updated: number;
  errors: string[];
  details: { index: string; month: string; value: number }[];
}> {
  const errors: string[] = [];
  const details: { index: string; month: string; value: number }[] = [];
  let updated = 0;
  
  // Make sure every mapped index has a row before importing. Without this, adding a
  // mapping silently does nothing on a database seeded before it existed: the loop below
  // walks the rows that ARE there, so a missing one is skipped rather than reported, and
  // the import claims success having imported nothing for it.
  for (const name of Object.keys(WPI_MAPPINGS)) {
    try {
      await prisma.priceIndex.upsert({
        where: { name },
        update: {},
        create: { name, baseValue: 100, description: `${name} (created automatically by the WPI import)` },
      });
    } catch (error) {
      errors.push(`Could not create the price index "${name}": ${error}`);
    }
  }

  // Get all price indices from database
  const priceIndices = await prisma.priceIndex.findMany();
  
  for (const priceIndex of priceIndices) {
    // Skip non-WPI indices (Labour, Steel types, MPNG Fuel)
    if (!WPI_MAPPINGS[priceIndex.name]) {
      logger.log(`[WPI] Skipping ${priceIndex.name} - not a WPI index`);
      continue;
    }
    
    const wpiMatch = findWPIDataForIndex(priceIndex.name, wpiData);
    if (!wpiMatch) {
      errors.push(`No WPI data found for ${priceIndex.name}`);
      continue;
    }
    
    logger.log(`[WPI] Found match for ${priceIndex.name}: ${wpiMatch.commName}`);
    
    // Filter months to update
    let valuesToUpdate = wpiMatch.monthlyValues;
    if (monthsToUpdate && monthsToUpdate.length > 0) {
      valuesToUpdate = valuesToUpdate.filter(mv => 
        monthsToUpdate.some(m => 
          m.getUTCFullYear() === mv.month.getUTCFullYear() &&
          m.getUTCMonth() === mv.month.getUTCMonth()
        )
      );
    }
    
    // Update each monthly value
    for (const { month, value } of valuesToUpdate) {
      try {
        await prisma.monthlyIndexValue.upsert({
          where: {
            priceIndexId_month: {
              priceIndexId: priceIndex.id,
              month: month
            }
          },
          update: {
            value: value,
            source: 'eaindustry.nic.in',
            isProvisional: isProvisional,
            updatedAt: new Date()
          },
          create: {
            priceIndexId: priceIndex.id,
            month: month,
            value: value,
            source: 'eaindustry.nic.in',
            isProvisional: isProvisional
          }
        });
        
        updated++;
        details.push({
          index: priceIndex.name,
          month: month.toISOString().slice(0, 7),
          value: value
        });
      } catch (error) {
        errors.push(`Failed to update ${priceIndex.name} for ${month.toISOString().slice(0, 7)}: ${error}`);
      }
    }
  }
  
  // Re-sync the whole "latest 2 months = provisional" invariant against the database
  // as it now stands, not just the months in this import's file. Deliberately NOT
  // gated on the isProvisional argument: the admin "Import as Final" button calls
  // this with isProvisional=false precisely when landing new months as settled, and
  // that is exactly the moment older months need re-checking against the database's
  // new latest two — gating on the flag was the actual defect, since the one case
  // that needs the reclassification most is the one that used to skip it entirely.
  try {
    const reapplied = await reapplyWpiProvisionalRule();
    if (reapplied.markedFinal > 0) {
      logger.log(`[WPI] Marked ${reapplied.markedFinal} older records as final`);
    }
    if (reapplied.markedProvisional > 0) {
      logger.log(`[WPI] Marked ${reapplied.markedProvisional} records as provisional for months: ${reapplied.latestMonths.join(', ')}`);
      details.push({ index: 'PROVISIONAL', month: reapplied.latestMonths.join(', '), value: reapplied.markedProvisional });
    }
  } catch (error) {
    errors.push(`Failed to update provisional status: ${error}`);
  }

  return {
    success: errors.length === 0,
    updated,
    errors,
    details
  };
}

// Get WPI download URL for a specific month
export function getWPIDownloadUrl(year: number, month: number): string {
  // The caller asks by DATA month. New-series files are named for their PUBLICATION
  // month — one later than the data they carry (the 15-Jun-2026 release file is
  // ...202606 and holds May data; verified against the live site, where the July file
  // 202607 ends at June's column). Asking for May 2026 data must therefore fetch file
  // 202606, and so on, with the year rolling over for December data.
  if (year > 2026 || (year === 2026 && month >= 5)) {
    const pubYear = month === 12 ? year + 1 : year;
    const pubMonth = month === 12 ? 1 : month + 1;
    return `https://eaindustry.nic.in/indx_download_2223/wpi_monthly_index_${pubYear}${pubMonth.toString().padStart(2, '0')}.xlsx`;
  }
  // The old 2011-12 series is not published one file per month. It is a single
  // cumulative workbook, and since the series closed there is exactly one final edition
  // — monthly_index_202606.xls — carrying every month from April 2012 to April 2026. So
  // any old-series request, whatever month it asks for, fetches the same file and finds
  // its month as a column inside it.
  //
  // (An earlier version built a per-month name here and always got a 1 KB error page,
  // which read as the archive having been taken down. It had not: the site simply has no
  // such file, and separately rejects unrecognised user agents. Both callers already
  // send a browser-style one.)
  return 'https://eaindustry.nic.in/indx_download_1112/monthly_index_202606.xls';
}

// Get latest available WPI file URL
export function getLatestWPIUrl(): string {
  const now = new Date();
  // WPI data is usually published with 2-3 week lag
  // So current month's data won't be available until next month
  let year = now.getFullYear();
  let month = now.getMonth(); // 0-indexed, so this gives us previous month
  
  if (month === 0) {
    month = 12;
    year--;
  }
  
  return getWPIDownloadUrl(year, month);
}
