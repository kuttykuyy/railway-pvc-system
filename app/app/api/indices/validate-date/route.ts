
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = "force-dynamic";

// GET /api/indices/validate-date?date=YYYY-MM-DD&isFinal=true
// Check if indices are available for a specific date
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const dateStr = searchParams.get('date');
    const isFinal = searchParams.get('isFinal') === 'true';
    
    if (!dateStr) {
      return NextResponse.json(
        { error: 'Date parameter is required' },
        { status: 400 }
      );
    }

    // Parse date and extract month
    const date = new Date(dateStr);
    const year = date.getFullYear();
    const month = date.getMonth() + 1; // JavaScript months are 0-indexed
    const monthKey = `${year}-${month.toString().padStart(2, '0')}`;
    
    // Get CORE price indices only (exclude city-specific variants)
    const allIndices = await prisma.priceIndex.findMany({ select: { id: true, name: true } });
    const citySpecificPattern = / - (Delhi|Mumbai|Chennai|Kolkata)$/;
    const coreIndices = allIndices.filter(idx => !citySpecificPattern.test(idx.name));
    const coreIndexIds = coreIndices.map(idx => idx.id);
    const totalIndicesCount = coreIndices.length;
    
    if (totalIndicesCount === 0) {
      return NextResponse.json({
        isValid: false,
        message: 'No price indices found in the system',
        date: dateStr,
        month: monthKey
      });
    }

    // Build where clause based on whether we need final or all indices (core only)
    const whereClause = isFinal 
      ? { 
          month: {
            gte: new Date(`${monthKey}-01`),
            lt: new Date(year, month, 1)
          },
          isProvisional: false,
          priceIndexId: { in: coreIndexIds }
        }
      : {
          month: {
            gte: new Date(`${monthKey}-01`),
            lt: new Date(year, month, 1)
          },
          priceIndexId: { in: coreIndexIds }
        };

    // Count how many indices we have for this month
    const availableIndicesCount = await prisma.monthlyIndexValue.groupBy({
      by: ['priceIndexId'],
      where: whereClause,
      _count: {
        priceIndexId: true
      }
    });

    const hasAllIndices = availableIndicesCount.length === totalIndicesCount;

    return NextResponse.json({
      isValid: hasAllIndices,
      date: dateStr,
      month: monthKey,
      availableIndices: availableIndicesCount.length,
      requiredIndices: totalIndicesCount,
      isFinal,
      message: hasAllIndices 
        ? 'All indices available for this date'
        : `Only ${availableIndicesCount.length} of ${totalIndicesCount} indices available for ${monthKey}`
    });

  } catch (error) {
    console.error('Error validating date:', error);
    return NextResponse.json(
      { error: 'Failed to validate date' },
      { status: 500 }
    );
  }
}
