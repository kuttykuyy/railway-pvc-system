/**
 * Labour Index Fetcher - Fetches CPI-IW (All India) data from Labour Bureau
 * Source: https://labourbureau.gov.in/all-india-index
 * Base Year: 2016 = 100
 */

import { prisma } from './db';

export interface LabourIndexData {
  month: Date;
  year: number;
  monthName: string;
  value: number;
  baseYear: number;
}

// Month name to number mapping
const MONTH_MAP: Record<string, number> = {
  'jan': 1, 'january': 1,
  'feb': 2, 'february': 2,
  'mar': 3, 'march': 3,
  'apr': 4, 'april': 4,
  'may': 5,
  'jun': 6, 'june': 6,
  'jul': 7, 'july': 7,
  'aug': 8, 'august': 8,
  'sep': 9, 'september': 9,
  'oct': 10, 'october': 10,
  'nov': 11, 'november': 11,
  'dec': 12, 'december': 12
};

/**
 * Parse Labour Bureau CSV data
 * CSV format: "S.No","Base Year","Survey Year","Survey Month","Index Value"
 */
export function parseLabourCSV(csvContent: string): LabourIndexData[] {
  const lines = csvContent.split('\n').filter(line => line.trim());
  const result: LabourIndexData[] = [];
  
  // Skip header line
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    // Parse CSV line handling quoted values
    const values = line.match(/"([^"]*)"/g)?.map(v => v.replace(/"/g, '').trim()) || [];
    
    if (values.length < 5) continue;
    
    const baseYear = parseInt(values[1]);
    const year = parseInt(values[2]);
    const monthName = values[3].toLowerCase();
    const value = parseFloat(values[4]);
    
    if (isNaN(baseYear) || isNaN(year) || isNaN(value)) continue;
    
    const monthNum = MONTH_MAP[monthName];
    if (!monthNum) continue;
    
    // Create date as first day of month in UTC
    const month = new Date(Date.UTC(year, monthNum - 1, 1));
    
    result.push({
      month,
      year,
      monthName: values[3],
      value,
      baseYear
    });
  }
  
  // Sort by date descending (newest first)
  result.sort((a, b) => b.month.getTime() - a.month.getTime());
  
  return result;
}

/**
 * Update Labour index in database from parsed data
 */
export async function updateLabourIndexFromData(
  data: LabourIndexData[],
  options: { isProvisional?: boolean; onlyMissing?: boolean } = {}
): Promise<{ updated: number; created: number; skipped: number }> {
  const { isProvisional = false, onlyMissing = false } = options;
  
  // Find the Labour price index
  const labourIndex = await prisma.priceIndex.findFirst({
    where: { name: 'Labour' }
  });
  
  if (!labourIndex) {
    throw new Error('Labour index not found in database. Please create it first.');
  }
  
  let updated = 0;
  let created = 0;
  let skipped = 0;
  
  for (const entry of data) {
    // Only process 2016 base year data
    if (entry.baseYear !== 2016) {
      skipped++;
      continue;
    }
    
    // Check if value exists for this month
    const existingValue = await prisma.monthlyIndexValue.findFirst({
      where: {
        priceIndexId: labourIndex.id,
        month: entry.month
      }
    });
    
    if (existingValue) {
      if (onlyMissing) {
        skipped++;
        continue;
      }
      
      // Update existing value
      await prisma.monthlyIndexValue.update({
        where: { id: existingValue.id },
        data: {
          value: entry.value,
          isProvisional,
          source: 'Labour Bureau CPI-IW',
          updatedAt: new Date()
        }
      });
      updated++;
    } else {
      // Create new value
      await prisma.monthlyIndexValue.create({
        data: {
          priceIndexId: labourIndex.id,
          month: entry.month,
          value: entry.value,
          isProvisional,
          source: 'Labour Bureau CPI-IW'
        }
      });
      created++;
    }
  }
  
  return { updated, created, skipped };
}

/**
 * Get preview of current Labour index data in database vs new data
 */
export async function getLabourIndexComparison(newData: LabourIndexData[]): Promise<{
  indexName: string;
  baseValue: number;
  entries: Array<{
    month: string;
    newValue: number;
    currentValue: number | null;
    needsUpdate: boolean;
  }>;
}> {
  const labourIndex = await prisma.priceIndex.findFirst({
    where: { name: 'Labour' }
  });
  
  if (!labourIndex) {
    throw new Error('Labour index not found in database');
  }
  
  // Get all current values
  const currentValues = await prisma.monthlyIndexValue.findMany({
    where: { priceIndexId: labourIndex.id },
    orderBy: { month: 'desc' }
  });
  
  const currentMap = new Map<string, number>();
  currentValues.forEach(v => {
    const key = v.month.toISOString().slice(0, 7); // YYYY-MM
    currentMap.set(key, v.value);
  });
  
  const entries = newData
    .filter(d => d.baseYear === 2016)
    .slice(0, 24) // Show last 24 months
    .map(d => {
      const monthKey = d.month.toISOString().slice(0, 7);
      const currentValue = currentMap.get(monthKey) || null;
      return {
        month: monthKey,
        newValue: d.value,
        currentValue,
        needsUpdate: currentValue === null || currentValue !== d.value
      };
    });
  
  return {
    indexName: 'Labour',
    baseValue: labourIndex.baseValue,
    entries
  };
}
