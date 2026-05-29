
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { canUserDeleteBills } from '@/lib/bill-permissions';

export const dynamic = "force-dynamic";

// POST /api/bills/bulk-delete - Delete multiple bills
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { billIds } = body;

    if (!billIds || !Array.isArray(billIds) || billIds.length === 0) {
      return NextResponse.json(
        { error: 'Invalid bill IDs provided' },
        { status: 400 }
      );
    }

    // Get user session
    const session = await getServerSession();
    
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get user details
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, role: true }
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Check if user can delete these bills
    const { allowed, reason } = await canUserDeleteBills(user.id, billIds, user.role);

    if (!allowed) {
      return NextResponse.json(
        { error: reason || 'You do not have permission to delete some or all of these bills' },
        { status: 403 }
      );
    }

    // Delete PVC calculations first
    await prisma.pvcCalculation.deleteMany({
      where: {
        billId: {
          in: billIds
        }
      }
    });

    // Delete the bills
    const deletedBills = await prisma.bill.deleteMany({
      where: {
        id: {
          in: billIds
        }
      }
    });

    return NextResponse.json({
      message: `${deletedBills.count} bills deleted successfully`,
      deletedCount: deletedBills.count
    });
  } catch (error) {
    console.error('Error bulk deleting bills:', error);
    return NextResponse.json(
      { error: 'Failed to delete bills' },
      { status: 500 }
    );
  }
}
