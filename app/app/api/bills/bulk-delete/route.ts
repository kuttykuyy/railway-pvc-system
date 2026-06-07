
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
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
    const session = await getServerSession(authOptions);
    
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

    // Delete InvoiceItems linked to BillTransactions for these bills
    // (InvoiceItem → BillTransaction lacks cascade, must delete manually first)
    const billTransactions = await prisma.billTransaction.findMany({
      where: { billId: { in: billIds } },
      select: { id: true },
    });
    const txIds = billTransactions.map((t) => t.id);
    if (txIds.length > 0) {
      await prisma.invoiceItem.deleteMany({ where: { billTransactionId: { in: txIds } } });
    }

    // Delete the bills — cascades handle PvcCalculation, BillTransaction, BillClassificationEntry, etc.
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
