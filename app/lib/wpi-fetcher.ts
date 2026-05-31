import { logger } from './logger';
/**
 * WPI Data Fetcher - Fetches Wholesale Price Index data from eaindustry.nic.in
 * Base Year: 2011-12 = 100
 */

import { prisma } from './db';

// WPI commodity codes mapping to our price indices
export const WPI_MAPPINGS: Record<string, { code: string; name: string; wpiName: string }> = {
  'RBI Cement': {
    code: '1313050000',
    name: 'RBI Cement',
    wpiName: 'e. Manufacture of cement, lime and plaster'
  },
  'RBI Plant Machinery': {
    code: '1318110000', 
    name: 'RBI Plant Machinery',
    wpiName: 'k. Manufacture of machinery for mining, quarrying and construction'
  },
  'RBI Explosives': {
    code: '1310070011',
    name: 'RBI Explosives',
    wpiName: 'Explosive'
  },
  'RBI Other Materials': {
    code: '1000000000',
    name: 'RBI Other Materials', 
    wpiName: 'All commodities'
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
  commName: string;
  commCode: string;
  commWeight: number;
  monthlyValues: { month: Date; value: number }[];
}

export function parseWPIExcelData(data: any[][]): WPIDataRow[] {
  if (!data || data.length < 2) return [];
  
  const headers = data[0] as string[];
  const result: WPIDataRow[] = [];
  
  // Find column indices for monthly data
  const monthColumns: { index: number; date: Date }[] = [];
  headers.forEach((header, idx) => {
    if (typeof header === 'string' && header.startsWith('INDX')) {
      const date = parseIndexColumn(header);
      if (date) {
        monthColumns.push({ index: idx, date });
      }
    }
  });
  
  // Parse each data row
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row || !row[0]) continue;
    
    const commName = String(row[0] || '').trim();
    const commCode = String(row[1] || '').trim();
    const commWeight = parseFloat(row[2]) || 0;
    
    const monthlyValues: { month: Date; value: number }[] = [];
    
    for (const col of monthColumns) {
      const value = parseFloat(row[col.index]);
      if (!isNaN(value) && value > 0) {
        monthlyValues.push({ month: col.date, value });
      }
    }
    
    if (commName && commCode && monthlyValues.length > 0) {
      result.push({ commName, commCode, commWeight, monthlyValues });
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
  
  // Find by code first (most accurate)
  let match = wpiData.find(row => row.commCode === mapping.code);
  if (match) return match;
  
  // Fallback to name matching
  match = wpiData.find(row => 
    row.commName.toLowerCase().includes(mapping.wpiName.toLowerCase()) ||
    mapping.wpiName.toLowerCase().includes(row.commName.toLowerCase())
  );
  
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
          const hasMapping = Object.values(WPI_MAPPINGS).some(m => m.code === wpiRow.commCode);
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
  const monthStr = month.toString().padStart(2, '0');
  return `https://eaindustry.nic.in/indx_download_1112/monthly_index_${year}${monthStr}.xls`;
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
