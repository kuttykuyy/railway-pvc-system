
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { advancedCache } from '@/lib/advanced-cache';

export const dynamic = "force-dynamic";

// GET /api/indices/available-date-range
// Get the date range for which indices are available
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const isFinal = searchParams.get('isFinal') === 'true';
    const debug = searchParams.get('debug') === 'true';

    const cacheKey = `available-date-range:${isFinal}:${debug}`;
    const cachedResult = advancedCache.get(cacheKey);
    if (cachedResult) {
      return NextResponse.json(cachedResult);
    }
    
    // Get CORE price indices only (exclude city-specific variants)
    const allPriceIndices = await prisma.priceIndex.findMany({
      select: { id: true, name: true }
    });
    const citySpecificPattern = / - (Delhi|Mumbai|Chennai|Kolkata)$/;
    const coreIndices = allPriceIndices.filter(idx => !citySpecificPattern.test(idx.name));

    // Only count indices that actually have some monthly data — exclude orphaned index records
    const indicesWithData = await prisma.monthlyIndexValue.findMany({
      where: { priceIndexId: { in: coreIndices.map(i => i.id) } },
      select: { priceIndexId: true },
      distinct: ['priceIndexId'],
    });
    const activeIndexIdSet = new Set(indicesWithData.map(i => i.priceIndexId));
    const priceIndices = coreIndices.filter(idx => activeIndexIdSet.has(idx.id));

    const coreIndexIds = priceIndices.map(idx => idx.id);
    const totalIndicesCount = priceIndices.length;
    
    if (totalIndicesCount === 0) {
      return NextResponse.json({
        minDate: null,
        maxDate: null,
        availableMonths: [],
        message: 'No price indices found in the system'
      });
    }

    // Build where clause based on whether we need final or all indices (core only)
    const whereClause = isFinal 
      ? { isProvisional: false, priceIndexId: { in: coreIndexIds } } 
      : { priceIndexId: { in: coreIndexIds } };

    // Get all monthly values with their price index
    const allMonthlyValues = await prisma.monthlyIndexValue.findMany({
      where: whereClause,
      select: {
        month: true,
        priceIndexId: true,
      },
      orderBy: { month: 'asc' }
    });

    // Group by month and count DISTINCT priceIndexIds
    const monthIndexMap = new Map<string, Set<string>>();
    
    for (const mv of allMonthlyValues) {
      const monthKey = mv.month.toISOString().substring(0, 7);
      if (!monthIndexMap.has(monthKey)) {
        monthIndexMap.set(monthKey, new Set());
      }
      monthIndexMap.get(monthKey)!.add(mv.priceIndexId);
    }

    // Filter months that have ALL indices (10 distinct priceIndexIds)
    const availableMonths: string[] = [];
    const incompleteMonths: { month: string; count: number; missing: string[] }[] = [];
    
    const sortedMonths = Array.from(monthIndexMap.keys()).sort();
    
    for (const month of sortedMonths) {
      const indexIds = monthIndexMap.get(month)!;
      if (indexIds.size >= totalIndicesCount) {
        availableMonths.push(month);
      } else if (debug) {
        // Find missing indices for debugging
        const missingIndices = priceIndices
          .filter(pi => !indexIds.has(pi.id))
          .map(pi => pi.name);
        incompleteMonths.push({ month, count: indexIds.size, missing: missingIndices });
      }
    }

    if (availableMonths.length === 0) {
      const response: any = {
        minDate: null,
        maxDate: null,
        availableMonths: [],
        message: isFinal ? 'No final indices available yet' : 'No complete months with all indices available yet',
        totalIndicesRequired: totalIndicesCount
      };
      if (debug && incompleteMonths.length > 0) {
        response.incompleteMonths = incompleteMonths.slice(-6); // Last 6 months
      }
      return NextResponse.json(response);
    }

    // Calculate min and max dates
    const minMonth = availableMonths[0];
    const maxMonth = availableMonths[availableMonths.length - 1];
    
    // Set min date to first day of first available month
    const minDate = `${minMonth}-01`;
    
    // Set max date to last day of last available month
    const [maxYear, maxMonthNum] = maxMonth.split('-').map(Number);
    const lastDay = new Date(maxYear, maxMonthNum, 0).getDate();
    const maxDate = `${maxMonth}-${lastDay.toString().padStart(2, '0')}`;

    const response: any = {
      minDate,
      maxDate,
      availableMonths,
      totalIndicesRequired: totalIndicesCount,
      availableMonthsCount: availableMonths.length,
      isFinal
    };
    
    if (debug && incompleteMonths.length > 0) {
      response.incompleteMonths = incompleteMonths.slice(-6);
    }

    advancedCache.set(cacheKey, response, 3600000, ['indices']); // Cache for 1 hour

    return NextResponse.json(response);

  } catch (error) {
    console.error('Error fetching available date range:', error);
    return NextResponse.json(
      { error: 'Failed to fetch available date range' },
      { status: 500 }
    );
  }
}
