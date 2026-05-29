
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = (session.user as any).id as string;
    const userRole = (session.user as any).role as string;

    const { searchParams } = new URL(request.url);
    const billId = searchParams.get('billId');

    if (!billId) {
      return NextResponse.json({ error: 'Bill ID is required' }, { status: 400 });
    }

    // Fetch bill with all related data
    const bill = await prisma.bill.findUnique({
      where: { id: billId },
      select: {
        id: true,
        billNo: true,
        contractId: true,
        pvcCalculation: {
          select: {
            totalPvc: true,
          },
        },
        contract: {
          select: {
            id: true,
            userId: true,
            workDescription: true,
            loaNo: true,
            agreementNo: true,
            user: {
              select: {
                name: true,
                companyName: true,
                gstin: true,
                division: true,
                divisionName: true,
                railwayZone: true,
                railwayZoneName: true,
              },
            },
          },
        },
      },
    });

    if (!bill) {
      return NextResponse.json({ error: 'Bill not found' }, { status: 404 });
    }

    // Check if user owns this bill or is admin
    if (bill.contract.userId !== userId && userRole !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Extract LOA date from loaNo if it contains a date
    let loaDate = '';
    if (bill.contract.loaNo) {
      const dateMatch = bill.contract.loaNo.match(/dt[:\s]*(\d{2}\.\d{2}\.\d{2,4})/);
      if (dateMatch) {
        loaDate = dateMatch[1];
      }
    }

    // Prepare prefilled data
    const prefillData = {
      contractId: bill.contract.id,
      // TO Section - from user profile (division)
      toDesignation: bill.contract.user?.divisionName 
        ? `Sr.DEN/${bill.contract.user.divisionName}` 
        : bill.contract.user?.division 
        ? `Sr.DEN/${bill.contract.user.division}`
        : 'Sr.DEN/Division',
      toOrganization: bill.contract.user?.railwayZoneName || 'Indian Railways',
      toDivision: `${bill.contract.user?.divisionName || bill.contract.user?.division || 'Division'} Division`,
      
      // Subject
      workDescription: bill.contract.workDescription || '',
      
      // Reference
      loaNumber: bill.contract.loaNo || '',
      loaDate: loaDate,
      agreementNumber: bill.contract.agreementNo || '',
      
      // Bill details
      billNumber: bill.billNo || `Bill-${bill.id}`,
      billAmount: (bill.pvcCalculation?.totalPvc || 0).toLocaleString('en-IN', {
        maximumFractionDigits: 2,
        minimumFractionDigits: 2,
      }),
      
      // Company details - from user profile
      companyName: bill.contract.user?.companyName || bill.contract.user?.name || '',
      companyGSTIN: bill.contract.user?.gstin || '',
      
      // Additional
      date: new Date().toLocaleDateString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      }),
      signatory: 'PARTNER',
      bodyText: 'In connection with the subject work, the price variation bill is worked out to Rs.{billAmount} covering CC Bill -I to CC Bill -V as per clause no:46A of GCC 2022 and the same is submitted for early payment please. The calculation sheets along with the indices are submitted here with this letter for the further process at your end.',
    };

    return NextResponse.json(prefillData);
  } catch (error) {
    console.error('Error fetching prefill data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch prefill data' },
      { status: 500 }
    );
  }
}

export const dynamic = 'force-dynamic';
