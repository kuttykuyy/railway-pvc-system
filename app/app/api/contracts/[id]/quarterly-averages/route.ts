

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getQuarterMonths } from '@/lib/pvc-calculations';
import { format } from 'date-fns';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { checkUserContractAccess } from '@/lib/permissions';

export const dynamic = "force-dynamic";

// GET /api/contracts/[id]/quarterly-averages - Get quarterly averages for all quarters
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const contractId = id;

    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    const requester = await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } });
    const access = requester ? await checkUserContractAccess(requester.id, contractId) : null;
    if (!access?.canView) return NextResponse.json({ error: 'You do not have access to this contract.' }, { status: 403 });

    const contract = await prisma.contract.findUnique({
      where: { id: contractId }
    });
    
    if (!contract) {
      return NextResponse.json(
        { error: 'Contract not found' },
        { status: 404 }
      );
    }

    // Get all bills for this contract
    const bills = await prisma.bill.findMany({
      where: { contractId },
      orderBy: { dateOfMeasurement: 'asc' },
      include: {
        pvcCalculation: true
      }
    });

    if (bills.length === 0) {
      return NextResponse.json({ quarterlyData: [] });
    }

    // Get unique quarters
    const quarters = [...new Set(bills.map((bill: any) => bill.quarter))].sort();
    
    // Classification 7A indices
    const classificationIndices = ['Labour', 'RBI Plant Machinery', 'MPNG Fuel', 'RBI Other Materials'];
    
    const quarterlyData = [];

    for (const quarter of quarters) {
      const quarterMonths = getQuarterMonths(quarter as string, new Date(contract.baseMonth));
      
      const quarterData = {
        quarter,
        quarterMonths: quarterMonths.map(month => format(month, 'MMMM yyyy')),
        components: [] as any[]
      };

      // Get quarterly averages for each index
      for (const indexName of classificationIndices) {
        const priceIndex = await prisma.priceIndex.findUnique({
          where: { name: indexName }
        });

        if (!priceIndex) continue;

        // Get base value from actual monthly data for the base month
        const baseMonthValue = await prisma.monthlyIndexValue.findFirst({
          where: {
            priceIndexId: priceIndex.id,
            month: {
              gte: contract.baseMonth,
              lt: new Date(contract.baseMonth.getFullYear(), contract.baseMonth.getMonth() + 1, 1)
            }
          }
        });

        // If no base month data found, skip this index
        if (!baseMonthValue) continue;

        const monthlyValues = await prisma.monthlyIndexValue.findMany({
          where: {
            priceIndexId: priceIndex.id,
            month: {
              in: quarterMonths
            }
          }
        });

        // Only calculate average if there are at least 3 months of data for a valid quarter
        const average = monthlyValues.length >= 3 
          ? monthlyValues.reduce((sum: number, val: any) => sum + val.value, 0) / monthlyValues.length
          : null;

        // Get component percentage
        let componentPercentage = 0;
        if (indexName === 'Labour') componentPercentage = 50;
        else if (indexName === 'RBI Plant Machinery') componentPercentage = 15;
        else if (indexName === 'MPNG Fuel') componentPercentage = 15;
        else if (indexName === 'RBI Other Materials') componentPercentage = 5;

        quarterData.components.push({
          indexName,
          baseValue: baseMonthValue.value, // Use actual base month value
          averageValue: average,
          componentPercentage,
          monthlyValues: monthlyValues.map(mv => ({
            month: format(mv.month, 'MMMM yyyy'),
            value: mv.value
          }))
        });
      }

      quarterlyData.push(quarterData);
    }

    return NextResponse.json({
      contract: {
        agreementNo: contract.agreementNo,
        contractorName: contract.contractorName,
        baseMonth: format(new Date(contract.baseMonth), 'MMMM yyyy')
      },
      quarterlyData
    });
  } catch (error) {
    console.error('Error fetching quarterly averages:', error);
    return NextResponse.json(
      { error: 'Failed to fetch quarterly averages' },
      { status: 500 }
    );
  }
}
