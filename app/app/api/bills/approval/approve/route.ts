
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { notifyApprovalEvent } from '@/lib/approval-telegram';
import { agreementMatchesZone } from '@/lib/railway-division-helper';

/**
 * POST /api/bills/approval/approve
 * Approve a submitted bill (railway officials only)
 */
export async function POST(req: NextRequest) {
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

    // Only railway officials and admins can approve
    if (user.role !== 'RAILWAY_OFFICIAL' && user.role !== 'railway_official' && user.role !== 'admin' && user.role !== 'superadmin') {
      return NextResponse.json(
        { error: 'Only railway officials can approve bills' },
        { status: 403 }
      );
    }

    const { billId, comments } = await req.json();

    if (!billId) {
      return NextResponse.json(
        { error: 'Bill ID is required' },
        { status: 400 }
      );
    }

    // Get the bill
    const bill = await prisma.bill.findUnique({
      where: { id: billId },
      include: { contract: { select: { agreementNo: true } } }
    });

    if (!bill) {
      return NextResponse.json(
        { error: 'Bill not found' },
        { status: 404 }
      );
    }

    // An official acts only inside their own zone. The role check alone let any
    // railway official on the platform act on every submitted bill nationwide — the
    // pending list and the submit routing are both zone-scoped, so this gap was plainly
    // unintentional. Admins remain unrestricted; a blank zone fails closed.
    const isAdminActor = user.role === 'admin' || user.role === 'superadmin';
    if (!isAdminActor && !agreementMatchesZone(bill.contract?.agreementNo, user.railwayZone)) {
      return NextResponse.json(
        { error: 'This bill belongs to a different railway zone.' },
        { status: 403 }
      );
    }

    // Only submitted bills can be approved
    if (bill.status !== 'submitted') {
      return NextResponse.json(
        { error: `Cannot approve bill with status: ${bill.status}` },
        { status: 400 }
      );
    }

    // Update bill status to approved
    const updatedBill = await prisma.bill.update({
      where: { id: billId },
      data: {
        status: 'approved',
        approvedAt: new Date(),
        approvedBy: user.id,
        approvalComments: comments || null
      }
    });

    // Create approval history entry
    await prisma.billApprovalHistory.create({
      data: {
        billId,
        userId: user.id,
        action: 'approved',
        previousStatus: bill.status,
        newStatus: 'approved',
        comments: comments || 'Bill approved'
      }
    });

    // Tell the people the proposal has just moved to or from. Best-effort — the
    // decision is already saved, and a lost message must not fail the request.
    notifyApprovalEvent({
      billId,
      event: 'approved',
      actorUserId: user.id,
      comments: comments || null,
    }).catch(() => {});

    // TODO: Send email notification to contractor
    // This can be implemented later with email service

    return NextResponse.json({
      success: true,
      message: 'Bill approved successfully',
      bill: updatedBill
    });

  } catch (error) {
    console.error('Approve bill error:', error);
    return NextResponse.json(
      { error: 'Failed to approve bill' },
      { status: 500 }
    );
  }
}
