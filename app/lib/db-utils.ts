
import { prisma } from './db';
import { getQuarterMonths } from './pvc-calculations';

export async function getQuarterlyAverages(quarter: string, priceIndexNames: string[], baseMonth: Date, calculationMethod: string = 'auto') {
  // Validate inputs
  if (!quarter || !Array.isArray(priceIndexNames) || priceIndexNames.length === 0) {
    throw new Error('Invalid parameters: quarter and priceIndexNames are required');
  }
  
  if (!baseMonth || isNaN(baseMonth.getTime())) {
    throw new Error('Invalid base month provided');
  }
  
  // Handle special quarters (Q0 or Base) - these represent the base month itself
  // For these cases, we should use the base month values directly
  let months: Date[];
  if (['Q0', 'Base'].includes(quarter)) {
    // For Q0 or Base quarter, use the base month only
    const normalizedBaseMonth = new Date(baseMonth.getFullYear(), baseMonth.getMonth(), 1);
    months = [normalizedBaseMonth];
  } else {
    // Get quarter months with error handling for regular quarters
    try {
      months = getQuarterMonths(quarter, baseMonth);
    } catch (error: any) {
      throw new Error(`Failed to calculate quarter months: ${error.message}`);
    }
  }
  
  
  const results = [];
  
  for (const indexName of priceIndexNames) {
    const priceIndex = await prisma.priceIndex.findUnique({
      where: { name: indexName }
    });
    
    if (!priceIndex) {
      continue;
    }
    
    // Get actual base month value for this specific contract
    // Normalize base month to first day of the month for database query
    const normalizedBaseMonth = new Date(baseMonth.getFullYear(), baseMonth.getMonth(), 1);
    
    const baseMonthValue = await prisma.monthlyIndexValue.findFirst({
      where: {
        priceIndexId: priceIndex.id,
        month: {
          gte: normalizedBaseMonth,
          lt: new Date(normalizedBaseMonth.getFullYear(), normalizedBaseMonth.getMonth() + 1, 1)
        }
      },
      orderBy: {
        month: 'desc'  // Get the most recent value for the base month
      }
    });
    
    // Use actual base month value if available, fallback to static base value
    const actualBaseValue = baseMonthValue?.value || priceIndex.baseValue;
    
    let monthlyValues;
    
    try {
      if (calculationMethod === 'manual') {
        // For manual calculation, try to get data from any of the quarter months
        // Prioritize manually entered data but fallback to auto-fetched if needed
        monthlyValues = await prisma.monthlyIndexValue.findMany({
          where: {
            priceIndexId: priceIndex.id,
            month: {
              in: months
            }
          },
          orderBy: {
            month: 'asc'  // Order by ascending to get months in sequence
          }
        });
      } else {
        // Auto calculation - same as before
        monthlyValues = await prisma.monthlyIndexValue.findMany({
          where: {
            priceIndexId: priceIndex.id,
            month: {
              in: months
            }
          },
          orderBy: {
            month: 'asc'  // Order by ascending to get months in sequence
          }
        });
      }
    } catch (error: any) {
      console.error(`Error querying monthly values for index ${indexName}:`, error);
      throw new Error(`Failed to fetch monthly index values for ${indexName}: ${error.message}`);
    }
    
    // IMPORTANT: For quarterly calculations, we need values for all months in the quarter.
    // For any month where an index value is missing, we use the PREVIOUS month's value as fallback.
    // This ensures provisional bills always have a complete 3-month average.
    // EXCEPTION: For Q0/Base quarters, we only use the base month itself (1 month)
    const isBaseQuarter = ['Q0', 'Base'].includes(quarter);
    
    if (!isBaseQuarter) {
      // Check which months are missing and fill them with the previous month's value
      const existingMonthSet = new Set(
        monthlyValues.map((mv: any) => new Date(mv.month).toISOString().slice(0, 7))
      );
      
      for (const targetMonth of months) {
        const targetKey = targetMonth.toISOString().slice(0, 7); // e.g. "2026-02"
        
        if (!existingMonthSet.has(targetKey)) {
          // This month is missing — fetch the most recent previous month's value for this index
          const previousMonthValue = await prisma.monthlyIndexValue.findFirst({
            where: {
              priceIndexId: priceIndex.id,
              month: {
                lt: targetMonth // strictly before the missing month
              }
            },
            orderBy: {
              month: 'desc' // get the most recent one
            }
          });
          
          if (previousMonthValue) {
            console.log(`[Provisional Fallback] Index "${indexName}" missing for ${targetKey}, using previous month value: ${previousMonthValue.value} from ${new Date(previousMonthValue.month).toISOString().slice(0, 7)}`);
            // Add a synthetic entry with the previous month's value but mapped to the missing month
            monthlyValues.push({
              ...previousMonthValue,
              month: targetMonth, // treat it as if it belongs to the missing month
              id: `fallback-${previousMonthValue.id}-${targetKey}`, // synthetic ID
            } as any);
          } else {
            console.log(`[Provisional Fallback] Index "${indexName}" missing for ${targetKey} and no previous month data found — skipping`);
          }
        }
      }
      
      // Re-sort by month after adding fallback values
      monthlyValues.sort((a: any, b: any) => new Date(a.month).getTime() - new Date(b.month).getTime());
    }
    
    // Calculate average using all available months (should be 3 for a complete quarter)
    if (monthlyValues.length > 0) {
      const average = monthlyValues.reduce((sum: number, val: any) => sum + val.value, 0) / monthlyValues.length;
      
      monthlyValues.forEach((mv: any) => {
      });
      
      results.push({
        quarter,
        indexName,
        average,
        baseValue: actualBaseValue, // Use actual base month value from database, not static default
        monthsUsed: monthlyValues.length, // Track how many months were used in the average
        includesFutureMonths: false,
        usesPreviousMonthFallback: monthlyValues.some((mv: any) => typeof mv.id === 'string' && mv.id.startsWith('fallback-'))
      });
    } else {
    }
  }
  
  return results;
}

export async function initializePriceIndices() {
  const baseIndices = [
    { name: 'Labour', baseValue: 129.90, description: 'Labour price index' },
    { name: 'RBI Plant Machinery', baseValue: 83.90, description: 'RBI Plant Machinery & Spares index' },
    { name: 'MPNG Fuel', baseValue: 93.06, description: 'MPNG Fuel & Lubricants index' },
    { name: 'RBI Other Materials', baseValue: 154.00, description: 'RBI Other Materials index' },
    { name: 'RBI Cement', baseValue: 137.40, description: 'RBI Cement index' },
    { name: 'RBI Explosives', baseValue: 190.10, description: 'RBI Explosives index' },
    { name: 'Steel TMT Bars', baseValue: 70150.00, description: 'Steel TMT Bars index' },
    { name: 'Steel Angle/Channel', baseValue: 69740.00, description: 'Steel Angle/Channel index' },
    { name: 'Steel Plates', baseValue: 75540.00, description: 'Steel Plates index' },
    { name: 'Steel Other Sections', baseValue: 71810.00, description: 'Steel Other Sections index' }
  ];

  for (const index of baseIndices) {
    await prisma.priceIndex.upsert({
      where: { name: index.name },
      update: {},
      create: index
    });
  }
}
