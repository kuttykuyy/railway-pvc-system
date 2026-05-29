
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getBillingSettings } from '@/lib/admin-settings';

/**
 * GET /api/indices/latest-available
 * 
 * Returns information about the latest available month for price indices
 * Used to display availability indicators on bill processing pages
 * 
 * A month is "complete" only if ALL 10 price indices are filled
 */
export async function GET() {
  try {
    // Get CORE price indices only (exclude city-specific variants like "Steel TMT Bars - Delhi", "MPNG Fuel - Mumbai")
    // City-specific indices are alternatives used by zone-specific bills, not universally required
    const allIndices = await prisma.priceIndex.findMany({ select: { id: true, name: true } });
    const citySpecificPattern = / - (Delhi|Mumbai|Chennai|Kolkata)$/;
    const coreIndices = allIndices.filter(idx => !citySpecificPattern.test(idx.name));
    const coreIndexIds = coreIndices.map(idx => idx.id);
    const totalPriceIndices = coreIndices.length;
    
    if (totalPriceIndices === 0) {
      return NextResponse.json({
        hasIndices: false,
        latestMonth: null,
        latestYear: null,
        isProvisional: false,
        isComplete: false,
        message: 'No price indices configured'
      });
    }

    // Find the latest monthly index value in the database
    const latestIndex = await prisma.monthlyIndexValue.findFirst({
      orderBy: {
        month: 'desc'
      },
      select: {
        month: true,
        isProvisional: true
      }
    });

    if (!latestIndex) {
      return NextResponse.json({
        hasIndices: false,
        latestMonth: null,
        latestYear: null,
        isProvisional: false,
        isComplete: false,
        message: 'No indices available'
      });
    }

    const latestDate = new Date(latestIndex.month);
    
    // Count how many CORE indices exist for the latest month
    const latestMonthIndicesCount = await prisma.monthlyIndexValue.count({
      where: {
        month: latestDate,
        priceIndexId: { in: coreIndexIds }
      }
    });
    
    // Count provisional CORE indices for the latest month
    const latestMonthProvisionalCount = await prisma.monthlyIndexValue.count({
      where: {
        month: latestDate,
        isProvisional: true,
        priceIndexId: { in: coreIndexIds }
      }
    });
    
    // Count final indices for the latest month
    const latestMonthFinalCount = latestMonthIndicesCount - latestMonthProvisionalCount;
    
    // Check if latest month is complete (all indices filled)
    const isLatestMonthComplete = latestMonthIndicesCount >= totalPriceIndices;
    
    // Determine overall status
    const isAllFinal = latestMonthProvisionalCount === 0 && isLatestMonthComplete;
    
    const month = latestDate.toLocaleString('en-US', { month: 'long' });
    const year = latestDate.getFullYear();
    const monthNumber = latestDate.getMonth() + 1;

    // Find the latest COMPLETE month (where all CORE indices are filled)
    const allMonthsWithCounts = await prisma.monthlyIndexValue.groupBy({
      by: ['month'],
      where: {
        priceIndexId: { in: coreIndexIds }
      },
      _count: true
    });
    
    // Filter months that have all core indices
    const completeMonths = allMonthsWithCounts
      .filter(m => m._count >= totalPriceIndices)
      .sort((a, b) => new Date(b.month).getTime() - new Date(a.month).getTime());
    
    let latestCompleteMonth = null;
    let latestCompleteYear = null;
    let latestCompleteMonthProvisional = false;
    
    if (completeMonths.length > 0) {
      const completeDate = new Date(completeMonths[0].month);
      latestCompleteMonth = completeDate.toLocaleString('en-US', { month: 'long' });
      latestCompleteYear = completeDate.getFullYear();
      
      // Check if complete month has any provisional (core indices only)
      const provisionalInComplete = await prisma.monthlyIndexValue.count({
        where: {
          month: completeDate,
          isProvisional: true,
          priceIndexId: { in: coreIndexIds }
        }
      });
      latestCompleteMonthProvisional = provisionalInComplete > 0;
    }

    // Check if provisional indices mode is enabled in admin settings
    const billingSettings = await getBillingSettings();
    const provisionalIndicesEnabled = billingSettings.provisionalIndicesCheckEnabled;

    return NextResponse.json({
      hasIndices: true,
      latestMonth: month,
      latestYear: year,
      monthNumber,
      isProvisional: latestMonthProvisionalCount > 0,
      isComplete: isLatestMonthComplete,
      isAllFinal,
      provisionalIndicesEnabled,
      formattedDate: `${month} ${year}`,
      
      // Latest month details
      latestMonthStats: {
        total: latestMonthIndicesCount,
        required: totalPriceIndices,
        final: latestMonthFinalCount,
        provisional: latestMonthProvisionalCount,
        missing: totalPriceIndices - latestMonthIndicesCount
      },
      
      // Latest complete month (all indices filled)
      latestCompleteMonth,
      latestCompleteYear,
      latestCompleteMonthProvisional,
      
      // Total months with complete data
      totalCompleteMonths: completeMonths.length
    });

  } catch (error) {
    console.error('Error fetching latest indices:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch latest indices information',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
