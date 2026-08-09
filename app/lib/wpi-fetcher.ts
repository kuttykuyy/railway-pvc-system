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
export const WPI_MAPPINGS: Record<string, { code: string; name: string; wpiName: string; newCode: string; newWpiName: string }> = {
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
  }
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

/** Excel's day count since 1899-12-30, which the new-series workbook uses as column headers. */
function excelSerialToDate(serial: number): Date | null {
  if (!isFinite(serial) || serial < 20000 || serial > 80000) return null;
  const date = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
  // Normalize to the first of the month — the headers are month markers.
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
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

// Find matching WPI data for our indices
export function findWPIDataForIndex(
  indexName: string, 
  wpiData: WPIDataRow[]
): WPIDataRow | null {
  const mapping = WPI_MAPPINGS[indexName];
  if (!mapping) return null;
  
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
  
  // If importing as provisional, only mark the latest 2 months as provisional
  // All previous records remain unchanged (keep their existing isProvisional status)
  if (isProvisional) {
    const wpiIndexIds = priceIndices
      .filter(pi => WPI_MAPPINGS[pi.name])
      .map(pi => pi.id);
    
    if (wpiIndexIds.length > 0) {
      try {
        // Find the latest 2 months across all WPI data being imported
        const allMonths = new Set<string>();
        for (const wpiRow of wpiData) {
          // Either series' code — this only reads month columns, which every row shares,
          // but matching the old code alone found nothing in a new-series workbook.
          const hasMapping = Object.values(WPI_MAPPINGS).some(m => m.code === wpiRow.commCode || m.newCode === wpiRow.commCode);
          if (hasMapping) {
            wpiRow.monthlyValues.forEach(mv => {
              allMonths.add(mv.month.toISOString().slice(0, 7));
            });
          }
        }
        const sortedMonths = Array.from(allMonths).sort().reverse();
        const latest2Months = sortedMonths.slice(0, 2);
        
        if (latest2Months.length > 0) {
          // Build date objects for the latest 2 months
          const latest2MonthDates = latest2Months.map(m => {
            const [y, mo] = m.split('-').map(Number);
            return new Date(Date.UTC(y, mo - 1, 1));
          });

          // Mark only the latest 2 months as provisional
          const bulkResult = await prisma.monthlyIndexValue.updateMany({
            where: {
              priceIndexId: { in: wpiIndexIds },
              month: { in: latest2MonthDates },
            },
            data: {
              isProvisional: true,
              updatedAt: new Date(),
            },
          });

          // Ensure older months are marked as final (not provisional)
          const olderResult = await prisma.monthlyIndexValue.updateMany({
            where: {
              priceIndexId: { in: wpiIndexIds },
              month: { notIn: latest2MonthDates },
              isProvisional: true,
            },
            data: {
              isProvisional: false,
              updatedAt: new Date(),
            },
          });
          if (olderResult.count > 0) {
            logger.log(`[WPI] Marked ${olderResult.count} older records as final`);
          }

          if (bulkResult.count > 0) {
            logger.log(`[WPI] Marked ${bulkResult.count} records as provisional for months: ${latest2Months.join(', ')}`);
            details.push({ index: 'PROVISIONAL', month: latest2Months.join(', '), value: bulkResult.count });
          }
        }
      } catch (error) {
        errors.push(`Failed to update provisional status: ${error}`);
      }
    }
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
  // The old series' folder no longer exists on the site (soft-404s) — this URL remains
  // only so historical requests fail visibly downstream instead of silently fetching
  // the wrong series.
  return `https://eaindustry.nic.in/indx_download_1112/monthly_index_${year}${month.toString().padStart(2, '0')}.xls`;
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
