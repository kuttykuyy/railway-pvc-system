
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { notifyApprovalEvent } from '@/lib/approval-telegram';

/**
 * POST /api/bills/approval/request-revision
 * Request revision on a submitted bill (railway officials only)
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

    // Only railway officials and admins can request revision
    if (user.role !== 'RAILWAY_OFFICIAL' && user.role !== 'railway_official' && user.role !== 'admin') {
      return NextResponse.json(
        { error: 'Only railway officials can request revisions' },
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

    if (!comments) {
      return NextResponse.json(
        { error: 'Comments are required when requesting revision' },
        { status: 400 }
      );
    }

    // Get the bill
    const bill = await prisma.bill.findUnique({
      where: { id: billId }
    });

    if (!bill) {
      return NextResponse.json(
        { error: 'Bill not found' },
        { status: 404 }
      );
    }

    // Only submitted bills can have revision requested
    if (bill.status !== 'submitted') {
      return NextResponse.json(
        { error: `Cannot request revision for bill with status: ${bill.status}` },
        { status: 400 }
      );
    }

    // Update bill status to revision_requested
    const updatedBill = await prisma.bill.update({
      where: { id: billId },
      data: {
        status: 'revision_requested',
        approvalComments: comments
      }
    });

    // Create approval history entry
    await prisma.billApprovalHistory.create({
      data: {
        billId,
        userId: user.id,
        action: 'revision_requested',
        previousStatus: bill.status,
        newStatus: 'revision_requested',
        comments
      }
    });

    // Tell the people the proposal has just moved to or from. Best-effort — the
    // decision is already saved, and a lost message must not fail the request.
    notifyApprovalEvent({
      billId,
      event: 'revision_requested',
      actorUserId: user.id,
      comments: comments,
    }).catch(() => {});

    // TODO: Send email notification to contractor
    // This can be implemented later with email service

    return NextResponse.json({
      success: true,
      message: 'Revision requested successfully',
      bill: updatedBill
    });

  } catch (error) {
    console.error('Request revision error:', error);
    return NextResponse.json(
      { error: 'Failed to request revision' },
      { status: 500 }
    );
  }
}
