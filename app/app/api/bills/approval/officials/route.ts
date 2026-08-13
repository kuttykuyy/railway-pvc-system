
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { parseAgreementNumber } from '@/lib/railway-division-helper';

export const dynamic = "force-dynamic";

/**
 * GET /api/bills/approval/officials?contractId=xxx
 * Get list of railway officials who can approve bills for a specific contract
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const contractId = searchParams.get('contractId');

    if (!contractId) {
      return NextResponse.json(
        { error: 'Contract ID is required' },
        { status: 400 }
      );
    }

    // Only someone with access to the contract may resolve it — this route let any
    // signed-in account turn contract ids into contractor identities, plus a roster of
    // officials' names, emails and postings for the zone.
    const requester = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    });
    const { checkUserContractAccess } = await import('@/lib/permissions');
    const access = requester ? await checkUserContractAccess(requester.id, contractId) : null;
    if (!access?.canView) {
      return NextResponse.json({ error: 'You do not have access to this contract.' }, { status: 403 });
    }

    // Get the contract
    const contract = await prisma.contract.findUnique({
      where: { id: contractId },
      select: {
        id: true,
        agreementNo: true,
        contractorName: true,
        workDescription: true,
      }
    });

    if (!contract) {
      return NextResponse.json(
        { error: 'Contract not found' },
        { status: 404 }
      );
    }

    // Parse agreement number to get zone and division
    const parsed = parseAgreementNumber(contract.agreementNo);
    
    if (!parsed) {
      return NextResponse.json(
        { error: 'Invalid agreement number format. Cannot determine zone and division.' },
        { status: 400 }
      );
    }

    // Find all railway officials matching the zone and division
    const officials = await prisma.user.findMany({
      where: {
        role: 'railway_official',
        railwayZone: parsed.zone,
        division: parsed.division,
        isCurrentPosting: true,
      },
      select: {
        id: true,
        name: true,
        email: true,
        designation: true,
        department: true,
        division: true,
        divisionName: true,
        railwayZone: true,
        railwayZoneName: true,
      },
      orderBy: {
        designation: 'asc',
      },
    });

    return NextResponse.json({
      success: true,
      officials,
      division: {
        zone: parsed.zone,
        zoneName: parsed.zoneName,
        division: parsed.division,
        divisionName: parsed.divisionName,
        department: parsed.department,
      },
      autoAssign: officials.length === 1, // Auto-assign if only one official
    });

  } catch (error) {
    console.error('Get officials error:', error);
    return NextResponse.json(
      { error: 'Failed to get railway officials' },
      { status: 500 }
    );
  }
}
