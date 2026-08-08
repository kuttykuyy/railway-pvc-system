
import { prisma } from './db';
import { getQuarterMonths } from './pvc-calculations';
import { getWpiLinkingFactors, isWpiIndexName, isNewSeriesMonth } from './wpi-series';

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

  // The WPI base-year change of June 2026: from that month the indices publish on base
  // 2022-23 = 100, discontinuous with the 2011-12 series every earlier value is on.
  // For contracts based before the switch, new-series months are lifted back to the old
  // base with the DPIIT linking factors (admin-overridable), so the ratio the PVC
  // formula takes stays a comparison of like with like. Contracts based after the
  // switch live wholly in the new series and are left alone. See lib/wpi-series.ts.
  const baseIsOldSeries = !isNewSeriesMonth(normalizedBaseMonth);
  const needsWpiBridge = baseIsOldSeries && priceIndexNames.some(isWpiIndexName);
  const wpiFactors = needsWpiBridge ? await getWpiLinkingFactors() : {};
  
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
  // Fallback values remember the month they were PUBLISHED for, not just the month they
  // stand in for: whether a value needs the WPI series bridge turns on which series it
  // was published in, and a May-2026 value standing in for August 2026 is old-series.
  const fallbackMaps: { [targetKey: string]: Map<string, { value: number; sourceMonth: Date }> } = {};
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
        
        fallbackMaps[targetKey] = new Map(fallbacks.map(f => [f.priceIndexId, { value: f.value, sourceMonth: new Date(f.month) }]));
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
          const fallback = fallbackMaps[targetKey]?.get(priceIndex.id);
          if (fallback !== undefined) {
            monthlyValues.push({
              id: `fallback-${priceIndex.id}-${targetKey}`,
              priceIndexId: priceIndex.id,
              month: targetMonth,
              // The month this value was actually published for — the series it belongs
              // to is decided by this, not by the month it stands in for.
              sourceMonth: fallback.sourceMonth,
              value: fallback.value,
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
      // Bridge the WPI series change: a value published June 2026 or later sits on the
      // new 2022-23 base and must be lifted to the old base (× linking factor) before it
      // can be compared with this contract's old-series base month. Judged per value by
      // its published month, so a quarter straddling the switch converts only the months
      // that need it. Stored data is never touched — this happens on the way into the
      // formula, and the flag below lets the statement say so.
      const factor = wpiFactors[indexName];
      let wpiMonthsConverted = 0;
      const effectiveValues = monthlyValues.map((mv: any) => {
        const publishedMonth = new Date(mv.sourceMonth ?? mv.month);
        if (factor && isNewSeriesMonth(publishedMonth)) {
          wpiMonthsConverted++;
          return { ...mv, value: mv.value * factor, wpiConverted: true };
        }
        return mv;
      });

      const average = effectiveValues.reduce((sum: number, val: any) => sum + val.value, 0) / effectiveValues.length;

      results.push({
        quarter,
        indexName,
        average,
        baseValue: actualBaseValue,
        monthsUsed: effectiveValues.length,
        includesFutureMonths: false,
        usesPreviousMonthFallback: effectiveValues.some((mv: any) => typeof mv.id === 'string' && mv.id.startsWith('fallback-')),
        // For the statement's disclosure line: which factor bridged the series change,
        // and for how many of the months used.
        ...(wpiMonthsConverted > 0 ? { wpiConverted: { factor, monthsConverted: wpiMonthsConverted } } : {}),
        monthlyValues: effectiveValues.map((mv: any) => ({
          month: new Date(mv.month).toISOString().slice(0, 7),
          value: mv.value,
          ...(mv.wpiConverted ? { wpiConverted: true } : {})
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
