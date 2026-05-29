/**
 * JPC Steel Price Fetcher
 * Handles import of steel prices from JPC (Joint Plant Committee) data
 * 
 * JPC publishes retail market prices for steel products across 4 metro cities:
 * Delhi, Mumbai, Chennai, Kolkata
 * 
 * NOTE: IR-PVC uses ONLY CHENNAI RATES for all steel calculations
 * 
 * Steel indices used in IR-PVC:
 * - Steel TMT Bars
 * - Steel Angle/Channel
 * - Steel Plates
 * - Steel Other Sections
 */

import { prisma } from '@/lib/db';

// JPC steel product mappings to IR-PVC indices
export const JPC_STEEL_MAPPINGS: Record<string, {
  indexName: string;
  jpcNames: string[]; // Possible JPC names to match
  description: string;
}> = {
  'TMT': {
    indexName: 'Steel TMT Bars',
    jpcNames: [
      'TMT 8MM',
      'TMT 10MM',
      'TMT 12MM',
      'TMT 16MM',
      'TMT BARS',
      'TMT Bars',
      'TMT',
      'TMT BAR',
      'Thermo Mechanically Treated Bars',
      'Fe-500 Grade TMT'
    ],
    description: 'TMT Bars (Thermo-Mechanically Treated Steel Bars)'
  },
  'ANGLE_CHANNEL': {
    indexName: 'Steel Angle/Channel',
    jpcNames: [
      'MS ANGLE 50X50X6 MM',
      'MS CHANNEL 75X40 MM',
      'ANGLE',
      'CHANNEL',
      'MS Angle',
      'MS Channel',
      'Angles & Channels',
      'Angle/Channel'
    ],
    description: 'MS Angles and Channels'
  },
  'PLATES': {
    indexName: 'Steel Plates',
    jpcNames: [
      'MS PLATE 6 MM',
      'MS PLATE 8 MM',
      'MS PLATE 10 MM',
      'MS PLATE',
      'HR PLATE',
      'Plates',
      'Hot Rolled Plates',
      'MS Plates'
    ],
    description: 'MS Plates (Hot Rolled Steel Plates)'
  },
  'OTHER_SECTIONS': {
    indexName: 'Steel Other Sections',
    jpcNames: [
      'MS FLAT',
      'MS ROUND',
      'MS BEAM',
      'FLAT',
      'ROUND',
      'BEAM',
      'Other Sections',
      'MS Beams',
      'MS Flats',
      'Wire Rods'
    ],
    description: 'Other Steel Sections (Flats, Rounds, Beams, etc.)'
  }
};

// Metro cities used by JPC
export const JPC_CITIES = ['Delhi', 'Mumbai', 'Chennai', 'Kolkata'] as const;

export interface JpcSteelEntry {
  product: string;
  delhi: number;
  mumbai: number;
  chennai: number;
  kolkata: number;
  average?: number;
}

export interface ParsedJpcData {
  month: string; // YYYY-MM format
  entries: JpcSteelEntry[];
}

export interface SteelImportResult {
  index: string;
  month: string;
  oldValue: number | null;
  newValue: number;
  status: 'new' | 'updated' | 'unchanged';
}

/**
 * Parse CSV data from JPC steel price format
 * Expected CSV format:
 * Product,Delhi,Mumbai,Chennai,Kolkata
 * TMT 8MM,54000,55500,56000,55000
 * MS PLATE 6 MM,62000,63000,64000,63500
 * 
 * NOTE: All 4 city prices are stored but only Chennai rate is used for calculations
 */
export function parseJpcCSV(csvContent: string): JpcSteelEntry[] {
  const lines = csvContent.trim().split('\n');
  if (lines.length < 2) {
    throw new Error('CSV must have header and at least one data row');
  }

  // Parse header to find city columns
  const header = lines[0].split(',').map(h => h.trim().toLowerCase());
  const productIndex = header.findIndex(h => 
    h.includes('product') || h.includes('item') || h.includes('description') || h === 's.no' || h === 'sl.no'
  );
  
  // If no product column found, assume first column is product
  const productCol = productIndex >= 0 ? productIndex : 0;
  
  // Find city columns (case-insensitive)
  const findCityColumn = (cityName: string) => {
    return header.findIndex(h => h.includes(cityName.toLowerCase()));
  };

  const delhiCol = findCityColumn('delhi');
  const mumbaiCol = findCityColumn('mumbai');
  const chennaiCol = findCityColumn('chennai');
  const kolkataCol = findCityColumn('kolkata') >= 0 ? findCityColumn('kolkata') : findCityColumn('calcutta');

  if (delhiCol < 0 || mumbaiCol < 0 || chennaiCol < 0 || kolkataCol < 0) {
    throw new Error('CSV must have columns for Delhi, Mumbai, Chennai, and Kolkata');
  }

  const entries: JpcSteelEntry[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = line.split(',').map(v => v.trim());
    if (values.length < 5) continue;

    const product = values[productCol]?.replace(/^"|"$/g, '').trim();
    if (!product) continue;

    const parsePrice = (val: string): number => {
      const cleaned = val.replace(/[^\d.-]/g, '');
      return parseFloat(cleaned) || 0;
    };

    const delhi = parsePrice(values[delhiCol]);
    const mumbai = parsePrice(values[mumbaiCol]);
    const chennai = parsePrice(values[chennaiCol]);
    const kolkata = parsePrice(values[kolkataCol]);

    // Skip rows with no valid prices
    if (delhi === 0 && mumbai === 0 && chennai === 0 && kolkata === 0) continue;

    // IR-PVC uses ONLY CHENNAI rates for steel calculations
    const average = chennai;

    entries.push({
      product,
      delhi,
      mumbai,
      chennai,
      kolkata,
      average: Math.round(average * 100) / 100
    });
  }

  return entries;
}

/**
 * Match JPC product names to IR-PVC steel indices
 */
export function matchProductToIndex(productName: string): string | null {
  const normalizedProduct = productName.toUpperCase().trim();
  
  for (const [key, mapping] of Object.entries(JPC_STEEL_MAPPINGS)) {
    for (const jpcName of mapping.jpcNames) {
      if (normalizedProduct.includes(jpcName.toUpperCase()) ||
          jpcName.toUpperCase().includes(normalizedProduct)) {
        return mapping.indexName;
      }
    }
  }
  
  return null;
}

/**
 * Calculate average for each steel index from JPC data
 * Uses ONLY Chennai rates for all calculations
 * For multiple products under same index, takes simple average of Chennai rates
 */
export function calculateIndexAverages(entries: JpcSteelEntry[]): Map<string, number> {
  const indexTotals = new Map<string, { sum: number; count: number }>();

  for (const entry of entries) {
    const indexName = matchProductToIndex(entry.product);
    if (!indexName || !entry.average) continue;

    const current = indexTotals.get(indexName) || { sum: 0, count: 0 };
    current.sum += entry.average;
    current.count += 1;
    indexTotals.set(indexName, current);
  }

  const result = new Map<string, number>();
  for (const [indexName, { sum, count }] of indexTotals) {
    result.set(indexName, Math.round((sum / count) * 100) / 100);
  }

  return result;
}

/**
 * Get comparison of new data vs existing database values
 */
export async function getSteelIndexComparison(
  month: Date,
  newAverages: Map<string, number>
): Promise<SteelImportResult[]> {
  const results: SteelImportResult[] = [];
  const monthStr = month.toISOString().slice(0, 7); // YYYY-MM

  for (const [indexName, newValue] of newAverages) {
    // Find the index
    const priceIndex = await prisma.priceIndex.findFirst({
      where: { name: indexName }
    });

    if (!priceIndex) {
      console.warn(`Index not found: ${indexName}`);
      continue;
    }

    // Find existing value for this month
    const monthStart = new Date(`${monthStr}-01T00:00:00.000Z`);
    const nextMonth = new Date(monthStart);
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    
    const existing = await prisma.monthlyIndexValue.findFirst({
      where: {
        priceIndexId: priceIndex.id,
        month: {
          gte: monthStart,
          lt: nextMonth
        }
      }
    });

    const oldValue = existing?.value ?? null;
    let status: 'new' | 'updated' | 'unchanged' = 'new';
    
    if (oldValue !== null) {
      status = Math.abs(oldValue - newValue) < 0.01 ? 'unchanged' : 'updated';
    }

    results.push({
      index: indexName,
      month: monthStr,
      oldValue,
      newValue,
      status
    });
  }

  return results;
}

/**
 * Import steel prices into the database
 */
export async function importSteelPrices(
  month: Date,
  averages: Map<string, number>,
  isProvisional: boolean = true
): Promise<SteelImportResult[]> {
  const results: SteelImportResult[] = [];
  const monthStart = new Date(month.getFullYear(), month.getMonth(), 1);

  for (const [indexName, newValue] of averages) {
    // Find the index
    const priceIndex = await prisma.priceIndex.findFirst({
      where: { name: indexName }
    });

    if (!priceIndex) {
      console.warn(`Index not found: ${indexName}`);
      continue;
    }

    // Find existing value for this month
    const existing = await prisma.monthlyIndexValue.findFirst({
      where: {
        priceIndexId: priceIndex.id,
        month: monthStart
      }
    });

    const oldValue = existing?.value ?? null;
    let status: 'new' | 'updated' | 'unchanged' = 'new';

    if (existing) {
      if (Math.abs(existing.value - newValue) < 0.01) {
        status = 'unchanged';
      } else {
        // Update existing value
        await prisma.monthlyIndexValue.update({
          where: { id: existing.id },
          data: {
            value: newValue,
            isProvisional,
            source: 'JPC Steel Prices',
            updatedAt: new Date()
          }
        });
        status = 'updated';
      }
    } else {
      // Create new value
      await prisma.monthlyIndexValue.create({
        data: {
          priceIndexId: priceIndex.id,
          month: monthStart,
          value: newValue,
          isProvisional,
          source: 'JPC Steel Prices'
        }
      });
      status = 'new';
    }

    results.push({
      index: indexName,
      month: monthStart.toISOString().slice(0, 7),
      oldValue,
      newValue,
      status
    });
  }

  return results;
}

/**
 * Parse manual entry format (simple key-value for each index)
 * Format:
 * TMT: 72000
 * Angle/Channel: 71000
 * Plates: 75000
 * Other Sections: 72500
 */
export function parseManualEntry(text: string): Map<string, number> {
  const result = new Map<string, number>();
  const lines = text.trim().split('\n');

  for (const line of lines) {
    const [key, value] = line.split(':').map(s => s.trim());
    if (!key || !value) continue;

    const numValue = parseFloat(value.replace(/[^\d.-]/g, ''));
    if (isNaN(numValue)) continue;

    // Match to index name
    const normalizedKey = key.toUpperCase();
    
    if (normalizedKey.includes('TMT')) {
      result.set('Steel TMT Bars', numValue);
    } else if (normalizedKey.includes('ANGLE') || normalizedKey.includes('CHANNEL')) {
      result.set('Steel Angle/Channel', numValue);
    } else if (normalizedKey.includes('PLATE')) {
      result.set('Steel Plates', numValue);
    } else if (normalizedKey.includes('OTHER') || normalizedKey.includes('SECTION')) {
      result.set('Steel Other Sections', numValue);
    }
  }

  return result;
}

/**
 * Get all steel indices from the database
 */
export async function getSteelIndices() {
  const steelIndexNames = Object.values(JPC_STEEL_MAPPINGS).map(m => m.indexName);
  
  return await prisma.priceIndex.findMany({
    where: {
      name: { in: steelIndexNames }
    },
    include: {
      monthlyValues: {
        orderBy: { month: 'desc' },
        take: 12
      }
    }
  });
}
