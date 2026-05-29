import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = "force-dynamic";

/**
 * GET /api/indices/completed-months
 * 
 * Returns a list of all completed months where ALL core price indices are available
 * Each month includes its status (Final or Provisional)
 */
export async function GET() {
  try {
    // Get CORE price indices only (exclude city-specific variants)
    const allIndices = await prisma.priceIndex.findMany({ select: { id: true, name: true } });
    const citySpecificPattern = / - (Delhi|Mumbai|Chennai|Kolkata)$/;
    const coreIndices = allIndices.filter(idx => !citySpecificPattern.test(idx.name));
    const coreIndexIds = coreIndices.map(idx => idx.id);
    const totalPriceIndices = coreIndices.length;
    
    if (totalPriceIndices === 0) {
      return NextResponse.json({
        completedMonths: [],
        totalCompleteMonths: 0
      });
    }

    // Find all months with complete data (all CORE indices present)
    const allMonthsWithCounts = await prisma.monthlyIndexValue.groupBy({
      by: ['month'],
      where: {
        priceIndexId: { in: coreIndexIds }
      },
      _count: true
    });
    
    // Filter months that have all core indices and sort descending (latest first)
    const completeMonths = allMonthsWithCounts
      .filter(m => m._count >= totalPriceIndices)
      .sort((a, b) => new Date(b.month).getTime() - new Date(a.month).getTime());

    if (completeMonths.length === 0) {
      return NextResponse.json({
        completedMonths: [],
        totalCompleteMonths: 0
      });
    }

    // For each complete month, check if it has any provisional indices
    const completedMonthsWithStatus = await Promise.all(
      completeMonths.map(async (m) => {
        const monthDate = new Date(m.month);
        
        // Count provisional CORE indices for this month
        const provisionalCount = await prisma.monthlyIndexValue.count({
          where: {
            month: monthDate,
            isProvisional: true,
            priceIndexId: { in: coreIndexIds }
          }
        });
        
        const monthName = monthDate.toLocaleString('en-US', { month: 'long', timeZone: 'Asia/Kolkata' });
        const year = monthDate.getFullYear();
        const isProvisional = provisionalCount > 0;
        
        return {
          month: monthName,
          year,
          monthDate: monthDate.toISOString(),
          status: isProvisional ? 'Provisional' : 'Final',
          isProvisional,
          finalIndices: totalPriceIndices - provisionalCount,
          provisionalIndices: provisionalCount,
          totalIndices: totalPriceIndices
        };
      })
    );

    return NextResponse.json({
      completedMonths: completedMonthsWithStatus,
      totalCompleteMonths: completedMonthsWithStatus.length
    });

  } catch (error) {
    console.error('Error fetching completed months:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch completed months',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
