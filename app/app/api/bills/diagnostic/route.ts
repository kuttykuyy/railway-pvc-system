
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getQuarterlyAverages } from '@/lib/db-utils';
import { getQuarterFromDate } from '@/lib/pvc-calculations';
import { getSteelIndexNamesForZone, getFuelIndexNameForBill } from '@/lib/zone-steel-city-mapping';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { checkUserBillAccess, checkUserContractAccess } from '@/lib/permissions';

export const dynamic = "force-dynamic";
export const revalidate = 0; // Disable caching completely

/**
 * Diagnostic endpoint to check what data is being used for PVC calculations
 * GET /api/bills/diagnostic?billId=xxx or ?contractId=xxx&measurementDate=xxx
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const billId = searchParams.get('billId');
    const contractId = searchParams.get('contractId');
    const measurementDate = searchParams.get('measurementDate');
    
    if (!billId && (!contractId || !measurementDate)) {
      return NextResponse.json({
        error: 'Provide either billId or both contractId and measurementDate'
      }, { status: 400 });
    }

    // Ownership: this endpoint dumps another user's contract/bill figures by id.
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    const requester = await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } });
    const access = requester
      ? (billId
          ? await checkUserBillAccess(requester.id, billId)
          : await checkUserContractAccess(requester.id, contractId!))
      : null;
    if (!access?.canView) return NextResponse.json({ error: 'You do not have access to this record.' }, { status: 403 });

    let bill: any = null;
    let contract: any;
    let quarter: string;
    let dateOfMeasurement: Date;
    
    if (billId) {
      // Get existing bill
      bill = await prisma.bill.findUnique({
        where: { id: billId },
        include: {
          contract: true,
          pvcCalculation: true
        }
      });
      
      if (!bill) {
        return NextResponse.json({ error: 'Bill not found' }, { status: 404 });
      }
      
      contract = bill.contract;
      quarter = bill.quarter;
      dateOfMeasurement = bill.dateOfMeasurement;
    } else {
      // Get contract and calculate quarter
      contract = await prisma.contract.findUnique({
        where: { id: contractId! }
      });
      
      if (!contract) {
        return NextResponse.json({ error: 'Contract not found' }, { status: 404 });
      }
      
      dateOfMeasurement = new Date(measurementDate!);
      quarter = getQuarterFromDate(dateOfMeasurement, contract.baseMonth);
    }
    
    // Fetch the same indices that would be used for PVC calculation
    // Use zone-based steel city prices
    const billZone = bill?.zone || null;
    const billFuelPriceType = bill?.fuelPriceType || null;
    const steelIndexNames = getSteelIndexNamesForZone(billZone);
    const fuelIndexName = getFuelIndexNameForBill(billZone, billFuelPriceType);
    const allIndices = [
      'Labour', 'RBI Plant Machinery', fuelIndexName, 'RBI Other Materials',
      'RBI Cement', 'RBI Explosives',
      ...steelIndexNames
    ];
    
    const quarterlyAverages = await getQuarterlyAverages(
      quarter, 
      allIndices, 
      contract.baseMonth, 
      'auto'
    );
    
    // Get all monthly index values used
    const detailedData = await Promise.all(quarterlyAverages.map(async (qa) => {
      const priceIndex = await prisma.priceIndex.findUnique({
        where: { name: qa.indexName }
      });
      
      if (!priceIndex) return null;
      
      // Get the actual monthly values used for this quarter
      const { getQuarterMonths } = require('@/lib/pvc-calculations');
      const months = getQuarterMonths(quarter, contract.baseMonth);
      
      const monthlyValues = await prisma.monthlyIndexValue.findMany({
        where: {
          priceIndexId: priceIndex.id,
          month: { in: months }
        },
        orderBy: { month: 'asc' }
      });
      
      return {
        indexName: qa.indexName,
        baseValue: qa.baseValue,
        average: qa.average,
        difference: qa.average - qa.baseValue,
        percentageChange: ((qa.average - qa.baseValue) / qa.baseValue * 100).toFixed(2) + '%',
        monthlyValues: monthlyValues.map(mv => ({
          month: new Date(mv.month).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', year: 'numeric', month: 'short' }),
          value: mv.value,
          status: mv.isProvisional ? 'provisional' : 'final',
          createdAt: mv.createdAt,
          updatedAt: mv.updatedAt
        }))
      };
    }));
    
    return NextResponse.json({
      bill: billId ? {
        id: bill?.id,
        billNo: bill?.billNo,
        billAmount: bill?.billAmount,
        createdAt: bill?.createdAt,
        updatedAt: bill?.updatedAt
      } : null,
      contract: {
        id: contract.id,
        agreementNo: contract.agreementNo,
        baseMonth: contract.baseMonth,
        baseMonthFormatted: new Date(contract.baseMonth).toLocaleDateString('en-IN', { 
          year: 'numeric', 
          month: 'long' 
        })
      },
      calculation: {
        quarter,
        dateOfMeasurement: new Date(dateOfMeasurement).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }),
        quarterlyAveragesSummary: quarterlyAverages.map(qa => ({
          index: qa.indexName,
          base: qa.baseValue,
          average: qa.average,
          change: (qa.average - qa.baseValue).toFixed(2),
          changePercent: ((qa.average - qa.baseValue) / qa.baseValue * 100).toFixed(2) + '%'
        }))
      },
      detailedIndicesData: detailedData.filter(d => d !== null),
      timestamp: new Date().toISOString(),
      message: 'This diagnostic shows exactly what data is being used for PVC calculations'
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });
    
  } catch (error: any) {
    console.error('Diagnostic error:', error);
    return NextResponse.json({
      error: 'Diagnostic failed',
      details: error.message,
      stack: error.stack
    }, { status: 500 });
  }
}
