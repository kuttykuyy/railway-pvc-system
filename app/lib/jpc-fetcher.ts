/**
 * JPC steel index import helpers.
 *
 * These work on ALREADY-AVERAGED index values (one per index, supplied by the
 * F1/F2 fortnight entry screen), and simply compare and store them.
 *
 * The product-basket logic that used to live here (parseJpcCSV /
 * calculateIndexAverages / JPC_STEEL_MAPPINGS) was REMOVED: it averaged the wrong
 * items (TMT 8/12/16mm, Angle 50x50x6, Plate 6/8mm) and so did not follow
 * GCC-2022 Clause 46A.9(1), which prescribes:
 *   Reinforcement bars  = avg of 10mm & 25mm dia TMT (IS1786 Fe500)
 *   Angles/channels     = avg of Angle 75x75x6, MS Plate 10mm, Channel 150x75 (IS2062 E250A)
 *   Plates              = avg of MS Plate 10mm & 25mm (IS2062 E250A)
 * The correct baskets live in lib/jpc-items.ts and must stay the only source.
 */

import { prisma } from '@/lib/db';

export interface SteelImportResult {
  index: string;
  month: string;
  oldValue: number | null;
  newValue: number;
  status: 'new' | 'updated' | 'unchanged';
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
  const steelIndexNames = [
    'Steel TMT Bars',
    'Steel Angle/Channel',
    'Steel Plates',
    'Steel Other Sections',
  ];

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
