
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = "force-dynamic";

/**
 * GET /api/bills/approval/history?billId=xxx
 * Get approval history for a bill
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

    const { searchParams } = new URL(req.url);
    const billId = searchParams.get('billId');

    if (!billId) {
      return NextResponse.json(
        { error: 'Bill ID is required' },
        { status: 400 }
      );
    }

    // Get the bill to verify access
    const bill = await prisma.bill.findUnique({
      where: { id: billId },
      include: {
        contract: true
      }
    });

    if (!bill) {
      return NextResponse.json(
        { error: 'Bill not found' },
        { status: 404 }
      );
    }

    // Contractors can only view history of their own bills
    // Railway officials and admins can view all
    if (user.role === 'contractor' && bill.contract.userId !== user.id) {
      return NextResponse.json(
        { error: 'You do not have permission to view this bill history' },
        { status: 403 }
      );
    }

    // Get approval history
    const history = await prisma.billApprovalHistory.findMany({
      where: { billId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            designation: true,
            department: true
          }
        }
      },
      orderBy: {
        timestamp: 'desc'
      }
    });

    return NextResponse.json({
      success: true,
      history
    });

  } catch (error) {
    console.error('Get approval history error:', error);
    return NextResponse.json(
      { error: 'Failed to get approval history' },
      { status: 500 }
    );
  }
}
