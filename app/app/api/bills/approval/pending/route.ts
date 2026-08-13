
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = "force-dynamic";

/**
 * GET /api/bills/approval/pending
 * Get all pending bills for railway officials to review
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

    const user = await prisma.user.findUnique({
      where: { email: session.user.email }
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Only railway officials and admins can view pending approvals
    if (user.role !== 'RAILWAY_OFFICIAL' && user.role !== 'railway_official' && user.role !== 'admin' && user.role !== 'superadmin') {
      return NextResponse.json(
        { error: 'Only railway officials can view pending approvals' },
        { status: 403 }
      );
    }

    // Get submitted bills — the official's OWN zone only. This listed every submitted
    // bill in the system to any official of any zone, with the whole contract record
    // attached (contractor phone, contract value, rebate). Admins still see all; an
    // official with no zone recorded sees none rather than everything.
    const isAdminViewer = user.role === 'admin' || user.role === 'superadmin';
    const allPending = await prisma.bill.findMany({
      where: {
        status: 'submitted'
      },
      include: {
        contract: {
          select: {
            id: true,
            agreementNo: true,
            contractorName: true,
            workDescription: true,
            contractValue: true,
            baseMonth: true,
            dateOfOpening: true,
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                companyName: true
              }
            }
          }
        },
        pvcCalculation: true
      },
      orderBy: {
        submittedAt: 'asc' // Oldest first
      }
    });
    const { agreementMatchesZone } = await import('@/lib/railway-division-helper');
    const pendingBills = isAdminViewer
      ? allPending
      : allPending.filter(b => agreementMatchesZone(b.contract?.agreementNo, user.railwayZone));

    // Get counts for dashboard
    const statusCounts = await prisma.bill.groupBy({
      by: ['status'],
      _count: {
        status: true
      }
    });

    const counts = {
      draft: 0,
      submitted: 0,
      approved: 0,
      rejected: 0,
      revision_requested: 0
    };

    statusCounts.forEach(item => {
      if (item.status in counts) {
        counts[item.status as keyof typeof counts] = item._count.status;
      }
    });

    return NextResponse.json({
      success: true,
      bills: pendingBills,
      counts
    });

  } catch (error) {
    console.error('Get pending bills error:', error);
    return NextResponse.json(
      { error: 'Failed to get pending bills' },
      { status: 500 }
    );
  }
}
