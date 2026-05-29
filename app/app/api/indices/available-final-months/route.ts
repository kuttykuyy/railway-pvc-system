
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = "force-dynamic";

// GET /api/indices/available-final-months
// Get months that have complete final (non-provisional) indices
export async function GET(request: NextRequest) {
  try {
    // Get CORE price indices only (exclude city-specific variants)
    const allIndices = await prisma.priceIndex.findMany({ select: { id: true, name: true } });
    const citySpecificPattern = / - (Delhi|Mumbai|Chennai|Kolkata)$/;
    const coreIndices = allIndices.filter(idx => !citySpecificPattern.test(idx.name));
    const coreIndexIds = coreIndices.map(idx => idx.id);
    const totalIndicesCount = coreIndices.length;
    
    if (totalIndicesCount === 0) {
      return NextResponse.json({
        months: [],
        message: 'No price indices found in the system'
      });
    }

    // Get months where we have final CORE indices for all price indices
    const monthlyValues = await prisma.monthlyIndexValue.groupBy({
      by: ['month'],
      where: {
        isProvisional: false,
        priceIndexId: { in: coreIndexIds }
      },
      _count: {
        priceIndexId: true
      },
      having: {
        priceIndexId: {
          _count: {
            equals: totalIndicesCount
          }
        }
      },
      orderBy: {
        month: 'desc'
      },
      take: 12 // Last 12 months with complete final data
    });

    const availableMonths = monthlyValues.map(value => 
      value.month.toISOString().substring(0, 7) // Format as YYYY-MM
    );

    return NextResponse.json({
      months: availableMonths,
      totalIndicesRequired: totalIndicesCount,
      availableMonthsCount: availableMonths.length
    });

  } catch (error) {
    console.error('Error fetching available final months:', error);
    return NextResponse.json(
      { error: 'Failed to fetch available final months' },
      { status: 500 }
    );
  }
}
