
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

    // The selectable range depends on the provisional setting, so it's part of the key.
    const { getBillingSettings } = await import('@/lib/admin-settings');
    const settings = await getBillingSettings();
    const allowProvisional = !isFinal && settings.provisionalIndicesCheckEnabled;

    const cacheKey = `available-date-range:${isFinal}:${debug}:${allowProvisional}`;
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

    // When provisional indices are allowed, a bill can be created for a month that has
    // only SOME indices (the rest are borrowed) — so the selectable date range should
    // reach those partial months, not just fully-complete ones. Otherwise the picker
    // stops at the last month that has all 10, blocking provisional bills.
    const completeMonths: string[] = [];   // has ALL indices
    const partialMonths: string[] = [];    // has at least one index
    const incompleteMonths: { month: string; count: number; missing: string[] }[] = [];

    const sortedMonths = Array.from(monthIndexMap.keys()).sort();

    for (const month of sortedMonths) {
      const indexIds = monthIndexMap.get(month)!;
      if (indexIds.size >= totalIndicesCount) {
        completeMonths.push(month);
        partialMonths.push(month);
      } else if (indexIds.size >= 1) {
        partialMonths.push(month);
        if (debug) {
          const missingIndices = priceIndices.filter(pi => !indexIds.has(pi.id)).map(pi => pi.name);
          incompleteMonths.push({ month, count: indexIds.size, missing: missingIndices });
        }
      }
    }

    // Months a date can be selected for. lastCompleteMonth drives the "all up to date" note.
    const availableMonths = allowProvisional ? partialMonths : completeMonths;
    const lastCompleteMonth = completeMonths.length ? completeMonths[completeMonths.length - 1] : null;

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

    // Last day of the last FULLY-complete month (for the "all indices up to date" note).
    let lastCompleteDate: string | null = null;
    if (lastCompleteMonth) {
      const [cy, cm] = lastCompleteMonth.split('-').map(Number);
      lastCompleteDate = `${lastCompleteMonth}-${new Date(cy, cm, 0).getDate().toString().padStart(2, '0')}`;
    }

    const response: any = {
      minDate,
      maxDate,
      lastCompleteDate,
      allowProvisional,
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
