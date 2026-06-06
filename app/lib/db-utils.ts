
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
  
  // 1. Fetch all price indices in a single query
  const priceIndices = await prisma.priceIndex.findMany({
    where: { name: { in: priceIndexNames } }
  });
  
  const priceIndexMap = new Map(priceIndices.map(pi => [pi.name, pi]));
  
  // 2. Fetch all base month values in a single query
  const normalizedBaseMonth = new Date(baseMonth.getFullYear(), baseMonth.getMonth(), 1);
  const nextBaseMonth = new Date(normalizedBaseMonth.getFullYear(), normalizedBaseMonth.getMonth() + 1, 1);
  
  const baseMonthValues = await prisma.monthlyIndexValue.findMany({
    where: {
      priceIndexId: { in: priceIndices.map(pi => pi.id) },
      month: {
        gte: normalizedBaseMonth,
        lt: nextBaseMonth
      }
    }
  });
  
  const baseValueMap = new Map(baseMonthValues.map(bmv => [bmv.priceIndexId, bmv.value]));
  
  // 3. Fetch all quarterly values in a single query
  const monthlyValuesAll = await prisma.monthlyIndexValue.findMany({
    where: {
      priceIndexId: { in: priceIndices.map(pi => pi.id) },
      month: { in: months }
    }
  });
  
  // Group quarterly values by priceIndexId
  const quarterlyValuesByIndex = new Map<string, any[]>();
  for (const mv of monthlyValuesAll) {
    if (!quarterlyValuesByIndex.has(mv.priceIndexId)) {
      quarterlyValuesByIndex.set(mv.priceIndexId, []);
    }
    quarterlyValuesByIndex.get(mv.priceIndexId)!.push(mv);
  }
  
  const results = [];
  const isBaseQuarter = ['Q0', 'Base'].includes(quarter);

  // Bulk fetch fallbacks for target months if any index is missing
  const fallbackMaps: { [targetKey: string]: Map<string, number> } = {};
  if (!isBaseQuarter) {
    for (const targetMonth of months) {
      const targetKey = targetMonth.toISOString().slice(0, 7);
      
      // Determine if any index is missing a value for this target month
      let anyMissing = false;
      for (const priceIndex of priceIndices) {
        const indexMvs = quarterlyValuesByIndex.get(priceIndex.id) || [];
        const hasMonth = indexMvs.some((mv: any) => new Date(mv.month).toISOString().slice(0, 7) === targetKey);
        if (!hasMonth) {
          anyMissing = true;
          break;
        }
      }
      
      if (anyMissing) {
        const fallbacks = await prisma.monthlyIndexValue.findMany({
          where: {
            priceIndexId: { in: priceIndices.map(pi => pi.id) },
            month: { lt: targetMonth }
          },
          orderBy: [
            { priceIndexId: 'asc' },
            { month: 'desc' }
          ],
          distinct: ['priceIndexId']
        });
        
        fallbackMaps[targetKey] = new Map(fallbacks.map(f => [f.priceIndexId, f.value]));
      }
    }
  }
  
  for (const indexName of priceIndexNames) {
    const priceIndex = priceIndexMap.get(indexName);
    if (!priceIndex) {
      continue;
    }
    
    const actualBaseValue = baseValueMap.get(priceIndex.id) || priceIndex.baseValue;
    
    const monthlyValues = [...(quarterlyValuesByIndex.get(priceIndex.id) || [])];
    
    if (!isBaseQuarter) {
      const existingMonthSet = new Set(
        monthlyValues.map((mv: any) => new Date(mv.month).toISOString().slice(0, 7))
      );
      
      for (const targetMonth of months) {
        const targetKey = targetMonth.toISOString().slice(0, 7);
        
        if (!existingMonthSet.has(targetKey)) {
          const fallbackVal = fallbackMaps[targetKey]?.get(priceIndex.id);
          if (fallbackVal !== undefined) {
            monthlyValues.push({
              id: `fallback-${priceIndex.id}-${targetKey}`,
              priceIndexId: priceIndex.id,
              month: targetMonth,
              value: fallbackVal,
              source: 'provisional-fallback',
              isProvisional: true,
              createdAt: new Date(),
              updatedAt: new Date()
            } as any);
          }
        }
      }
      
      monthlyValues.sort((a: any, b: any) => new Date(a.month).getTime() - new Date(b.month).getTime());
    }
    
    if (monthlyValues.length > 0) {
      const average = monthlyValues.reduce((sum: number, val: any) => sum + val.value, 0) / monthlyValues.length;
      
      results.push({
        quarter,
        indexName,
        average,
        baseValue: actualBaseValue,
        monthsUsed: monthlyValues.length,
        includesFutureMonths: false,
        usesPreviousMonthFallback: monthlyValues.some((mv: any) => typeof mv.id === 'string' && mv.id.startsWith('fallback-')),
        monthlyValues: monthlyValues.map((mv: any) => ({
          month: new Date(mv.month).toISOString().slice(0, 7),
          value: mv.value
        }))
      });
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
