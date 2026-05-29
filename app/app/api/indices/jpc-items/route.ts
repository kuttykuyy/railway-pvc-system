import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { validateAdminAccess } from '@/lib/role-auth';
import { JPC_ITEMS, PVC_CALCULATION_ITEMS } from '@/lib/jpc-items';

/**
 * GET: Retrieve JPC steel item records
 * Query params:
 * - month: YYYY-MM format (required)
 * - city: City name (default: Chennai)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const monthParam = searchParams.get('month');
    const city = searchParams.get('city') || 'Chennai';
    
    if (!monthParam) {
      return NextResponse.json(
        { error: 'Month parameter required (YYYY-MM format)' },
        { status: 400 }
      );
    }
    
    const monthDate = new Date(`${monthParam}-01T00:00:00.000Z`);
    if (isNaN(monthDate.getTime())) {
      return NextResponse.json(
        { error: 'Invalid month format. Use YYYY-MM' },
        { status: 400 }
      );
    }
    
    // Get all JPC items for the month
    const items = await prisma.jpcSteelItem.findMany({
      where: {
        month: monthDate,
        city: city
      },
      orderBy: { itemCode: 'asc' }
    });
    
    // Create a map of item code to data
    const itemsMap: Record<string, any> = {};
    items.forEach(item => {
      itemsMap[item.itemCode] = {
        id: item.id,
        itemCode: item.itemCode,
        itemName: item.itemName,
        category: item.category,
        indexMapping: item.indexMapping,
        f1: item.f1,
        f2: item.f2,
        average: item.average,
        source: item.source
      };
    });
    
    // Calculate index averages using the railway formula
    const indexAverages = calculateIndexAverages(itemsMap);
    
    return NextResponse.json({
      success: true,
      month: monthParam,
      city,
      items: itemsMap,
      itemCount: items.length,
      indexAverages,
      jpcItemsDefinition: JPC_ITEMS
    });
  } catch (error) {
    console.error('Error fetching JPC items:', error);
    return NextResponse.json(
      { error: 'Failed to fetch JPC items' },
      { status: 500 }
    );
  }
}

/**
 * POST: Save JPC steel item records
 * Body:
 * - month: YYYY-MM format (required)
 * - city: City name (default: Chennai)
 * - items: Record<itemCode, { f1?: number, f2?: number }>
 * - source: Source description (optional)
 * - importToIndices: boolean - whether to also update steel indices
 * - isProvisional: boolean - if importing to indices, mark as provisional
 */
export async function POST(request: NextRequest) {
  try {
    const adminCheck = await validateAdminAccess(request);
    if (!adminCheck.authorized) {
      return NextResponse.json(
        { error: adminCheck.message || 'Unauthorized' },
        { status: 403 }
      );
    }
    
    const body = await request.json();
    const { month, city = 'Chennai', items, source, importToIndices = false, isProvisional = false } = body;
    
    if (!month) {
      return NextResponse.json(
        { error: 'Month is required (YYYY-MM format)' },
        { status: 400 }
      );
    }
    
    if (!items || typeof items !== 'object') {
      return NextResponse.json(
        { error: 'Items object is required' },
        { status: 400 }
      );
    }
    
    const monthDate = new Date(`${month}-01T00:00:00.000Z`);
    if (isNaN(monthDate.getTime())) {
      return NextResponse.json(
        { error: 'Invalid month format. Use YYYY-MM' },
        { status: 400 }
      );
    }
    
    // Process and save each item
    const results: { created: number; updated: number; skipped: number } = {
      created: 0,
      updated: 0,
      skipped: 0
    };
    
    const savedItems: Record<string, { f1: number | null; f2: number | null; average: number | null }> = {};
    
    for (const jpcItem of JPC_ITEMS) {
      const itemData = items[jpcItem.id];
      if (!itemData) continue;
      
      const f1 = itemData.f1 ? parseFloat(itemData.f1) : null;
      const f2 = itemData.f2 ? parseFloat(itemData.f2) : null;
      
      // Skip if both values are empty/zero
      if ((!f1 || f1 === 0) && (!f2 || f2 === 0)) {
        results.skipped++;
        continue;
      }
      
      // Calculate average - keep 2 decimal places
      let average: number | null = null;
      if (f1 && f2) {
        average = parseFloat(((f1 + f2) / 2).toFixed(2));
      } else if (f1) {
        average = f1;
      } else if (f2) {
        average = f2;
      }
      
      // Upsert the record
      const existing = await prisma.jpcSteelItem.findUnique({
        where: {
          itemCode_month_city: {
            itemCode: jpcItem.id,
            month: monthDate,
            city: city
          }
        }
      });
      
      if (existing) {
        await prisma.jpcSteelItem.update({
          where: { id: existing.id },
          data: {
            f1,
            f2,
            average,
            source: source || existing.source,
            updatedAt: new Date()
          }
        });
        results.updated++;
      } else {
        await prisma.jpcSteelItem.create({
          data: {
            itemCode: jpcItem.id,
            itemName: jpcItem.name,
            category: jpcItem.category,
            indexMapping: jpcItem.indexMapping,
            month: monthDate,
            city: city,
            f1,
            f2,
            average,
            source: source || `JPC ${month}`
          }
        });
        results.created++;
      }
      
      savedItems[jpcItem.id] = { f1, f2, average };
    }
    
    // Calculate index averages using the railway formula
    const indexAverages = calculateIndexAveragesFromData(savedItems);
    
    // Import to steel indices if requested
    let indexImportResults: any = null;
    if (importToIndices) {
      indexImportResults = await importToSteelIndices(monthDate, indexAverages, isProvisional, city);
    }
    
    return NextResponse.json({
      success: true,
      month,
      city,
      results,
      savedCount: Object.keys(savedItems).length,
      indexAverages,
      indexImportResults
    });
  } catch (error) {
    console.error('Error saving JPC items:', error);
    return NextResponse.json(
      { error: 'Failed to save JPC items' },
      { status: 500 }
    );
  }
}

/**
 * Calculate index averages from items map (database format)
 */
function calculateIndexAverages(itemsMap: Record<string, any>): Record<string, { value: number; formula: string }> {
  const getValues = (itemId: string) => {
    const item = itemsMap[itemId];
    return {
      f1: item?.f1 || 0,
      f2: item?.f2 || 0,
      avg: item?.average || 0
    };
  };
  
  return calculateAveragesFromGetValues(getValues);
}

/**
 * Calculate index averages from saved data (API format)
 */
function calculateIndexAveragesFromData(
  savedItems: Record<string, { f1: number | null; f2: number | null; average: number | null }>
): Record<string, { value: number; formula: string }> {
  const getValues = (itemId: string) => {
    const item = savedItems[itemId];
    return {
      f1: item?.f1 || 0,
      f2: item?.f2 || 0,
      avg: item?.average || 0
    };
  };
  
  return calculateAveragesFromGetValues(getValues);
}

/**
 * Core calculation logic using the GCC 2022 Clause 46A.9 formula:
 * 
 * TMT Bars: (10mm_F1 + 10mm_F2 + 25mm_F1 + 25mm_F2) ÷ 4
 * Angle/Channel: Average of [ISA 75x6 avg, MS Plate-10mm avg, ISMC 150x75 avg]
 * Plates: Average of [MS Plate-10mm avg, MS Plate-25mm avg]
 * Other Sections: (TMT + Angle/Channel + Plates) ÷ 3 [GCC 46A.9]
 */
function calculateAveragesFromGetValues(
  getValues: (itemId: string) => { f1: number; f2: number; avg: number }
): Record<string, { value: number; formula: string }> {
  const result: Record<string, { value: number; formula: string }> = {};
  
  // TMT Bars: Average of all 4 F1/F2 values - keep 2 decimal places
  const tmt10 = getValues('tmt_10mm');
  const tmt25 = getValues('tmt_25mm');
  const tmtValues = [tmt10.f1, tmt10.f2, tmt25.f1, tmt25.f2].filter(v => v > 0);
  if (tmtValues.length > 0) {
    const sum = tmtValues.reduce((a, b) => a + b, 0);
    result.TMT = {
      value: parseFloat((sum / tmtValues.length).toFixed(2)),
      formula: `(${tmt10.f1 || '-'} + ${tmt10.f2 || '-'} + ${tmt25.f1 || '-'} + ${tmt25.f2 || '-'}) ÷ ${tmtValues.length}`
    };
  } else {
    result.TMT = { value: 0, formula: '-' };
  }
  
  // Angle/Channel: Average of item averages - keep 2 decimal places
  const isaAvg = getValues('angle_75x75x6mm').avg;
  const plateAvg = getValues('plate_10mm').avg;
  const ismcAvg = getValues('channel_150x75mm').avg;
  const angleValues = [isaAvg, plateAvg, ismcAvg].filter(v => v > 0);
  if (angleValues.length > 0) {
    const sum = angleValues.reduce((a, b) => a + b, 0);
    result.ANGLE_CHANNEL = {
      value: parseFloat((sum / angleValues.length).toFixed(2)),
      formula: `(${isaAvg || '-'} + ${plateAvg || '-'} + ${ismcAvg || '-'}) ÷ ${angleValues.length}`
    };
  } else {
    result.ANGLE_CHANNEL = { value: 0, formula: '-' };
  }
  
  // Plates: Average of item averages - keep 2 decimal places
  const plate10Avg = getValues('plate_10mm').avg;
  const plate25Avg = getValues('plate_25mm').avg;
  const platesValues = [plate10Avg, plate25Avg].filter(v => v > 0);
  if (platesValues.length > 0) {
    const sum = platesValues.reduce((a, b) => a + b, 0);
    result.PLATES = {
      value: parseFloat((sum / platesValues.length).toFixed(2)),
      formula: `(${plate10Avg || '-'} + ${plate25Avg || '-'}) ÷ ${platesValues.length}`
    };
  } else {
    result.PLATES = { value: 0, formula: '-' };
  }
  
  // Other Sections: (TMT + Angle/Channel + Plates) ÷ 3 as per GCC 2022 Clause 46A.9
  const tmtVal = result.TMT.value;
  const angleVal = result.ANGLE_CHANNEL.value;
  const platesVal = result.PLATES.value;
  
  const validIndices = [tmtVal, angleVal, platesVal].filter(v => v > 0);
  if (validIndices.length > 0) {
    const sum = validIndices.reduce((a, b) => a + b, 0);
    result.OTHER_SECTIONS = {
      value: parseFloat((sum / validIndices.length).toFixed(2)),
      formula: `(${tmtVal || '-'} + ${angleVal || '-'} + ${platesVal || '-'}) ÷ ${validIndices.length} [GCC 46A.9]`
    };
  } else {
    result.OTHER_SECTIONS = { value: 0, formula: '-' };
  }
  
  return result;
}

/**
 * Import calculated averages to steel indices (MonthlyIndexValue)
 * Saves to both the default (Chennai-based) indices AND city-specific indices
 */
async function importToSteelIndices(
  monthDate: Date,
  indexAverages: Record<string, { value: number; formula: string }>,
  isProvisional: boolean,
  city: string = 'Chennai'
): Promise<{ created: number; updated: number }> {
  const results = { created: 0, updated: 0 };
  
  const indexNameMap: Record<string, string> = {
    TMT: 'Steel TMT Bars',
    ANGLE_CHANNEL: 'Steel Angle/Channel',
    PLATES: 'Steel Plates',
    OTHER_SECTIONS: 'Steel Other Sections'
  };
  
  for (const [indexKey, calcResult] of Object.entries(indexAverages)) {
    const avgValue = calcResult.value;
    if (!avgValue || avgValue === 0) continue;
    
    const baseIndexName = indexNameMap[indexKey];
    if (!baseIndexName) continue;
    
    // Build list of index names to update:
    // 1. Default index (for Chennai only, backward compatibility)
    // 2. City-specific index (e.g., "Steel TMT Bars - Delhi")
    const indexNames: string[] = [];
    if (city === 'Chennai') {
      indexNames.push(baseIndexName); // Update default (Chennai) index
    }
    indexNames.push(`${baseIndexName} - ${city}`); // Always update city-specific index
    
    for (const indexName of indexNames) {
      const priceIndex = await prisma.priceIndex.findFirst({
        where: { name: indexName }
      });
      
      if (!priceIndex) {
        console.warn(`Price index not found: ${indexName}`);
        continue;
      }
      
      // Check if value exists
      const existing = await prisma.monthlyIndexValue.findUnique({
        where: {
          priceIndexId_month: {
            priceIndexId: priceIndex.id,
            month: monthDate
          }
        }
      });
      
      if (existing) {
        await prisma.monthlyIndexValue.update({
          where: { id: existing.id },
          data: {
            value: avgValue,
            isProvisional,
            source: `JPC ${city}`
          }
        });
        results.updated++;
      } else {
        await prisma.monthlyIndexValue.create({
          data: {
            priceIndexId: priceIndex.id,
            month: monthDate,
            value: avgValue,
            isProvisional,
            source: `JPC ${city}`
          }
        });
        results.created++;
      }
    }
  }
  
  return results;
}
