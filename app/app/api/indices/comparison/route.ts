import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getQuarterFromDate } from '@/lib/pvc-calculations';
import { getQuarterlyAverages } from '@/lib/db-utils';

export const dynamic = 'force-dynamic';

/**
 * GET /api/indices/comparison?contractId=xxx&measurementDate=yyyy-mm-dd
 * Returns { base: { [indexName]: number }, current: { [indexName]: number } }
 * Used by the classification comparison dialog to calculate PVC.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const contractId = searchParams.get('contractId');
    const measurementDateStr = searchParams.get('measurementDate');

    if (!contractId || !measurementDateStr) {
      return NextResponse.json(
        { error: 'contractId and measurementDate are required' },
        { status: 400 }
      );
    }

    const contract = await prisma.contract.findUnique({
      where: { id: contractId },
      select: { baseMonth: true }
    });

    if (!contract) {
      return NextResponse.json(
        { error: 'Contract not found' },
        { status: 404 }
      );
    }

    const baseMonth = new Date(contract.baseMonth);
    const measurementDate = new Date(measurementDateStr);
    const quarter = getQuarterFromDate(measurementDate, baseMonth);

    // Get all price indices
    const allIndices = await prisma.priceIndex.findMany();

    // Fetch base month indices
    const normalizedBaseMonth = new Date(baseMonth.getFullYear(), baseMonth.getMonth(), 1);
    const base: { [key: string]: number } = {};

    for (const index of allIndices) {
      const baseMonthValue = await prisma.monthlyIndexValue.findFirst({
        where: {
          priceIndexId: index.id,
          month: {
            gte: normalizedBaseMonth,
            lt: new Date(normalizedBaseMonth.getFullYear(), normalizedBaseMonth.getMonth() + 1, 1)
          }
        },
        orderBy: { month: 'desc' }
      });
      base[index.name] = baseMonthValue?.value || index.baseValue;
    }

    // Fetch quarterly averages
    const indexNames = allIndices.map(idx => idx.name);
    const quarterlyAveragesArray = await getQuarterlyAverages(
      quarter,
      indexNames,
      contract.baseMonth,
      'auto'
    );

    const current: { [key: string]: number } = {};
    quarterlyAveragesArray.forEach((item: any) => {
      current[item.indexName] = item.average;
    });

    return NextResponse.json({ base, current });
  } catch (error) {
    console.error('Error fetching comparison indices:', error);
    return NextResponse.json(
      { error: 'Failed to fetch indices' },
      { status: 500 }
    );
  }
}
