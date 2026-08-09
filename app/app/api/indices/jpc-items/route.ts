import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { validateAdminAccess } from '@/lib/role-auth';
import { JPC_ITEMS, PVC_CALCULATION_ITEMS } from '@/lib/jpc-items';
import { calculateAveragesFromGetValues, importToSteelIndices } from '@/lib/jpc-index-calc';

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



