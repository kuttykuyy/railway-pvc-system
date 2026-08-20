
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { canUserDeleteBills } from '@/lib/bill-permissions';
import { recalculateCumulativePvcForContract } from '@/lib/recalculateCumulativePvc';
import { advancedCache } from '@/lib/advanced-cache';

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

    const billsToDelete = await prisma.bill.findMany({
      where: { id: { in: billIds } },
      select: { id: true, contractId: true },
    });
    const affectedContractIds = [...new Set(billsToDelete.map(bill => bill.contractId))];

    // Delete InvoiceItems linked to BillTransactions for these bills
    // (InvoiceItem → BillTransaction lacks cascade, must delete manually first) — and
    // correct their parent invoices by the same amount, exactly as the single delete
    // does. This route removed the lines without touching the totals, so an invoice
    // that had billed a since-bulk-deleted bill kept an outstanding amount for line
    // items that no longer existed.
    const billTransactions = await prisma.billTransaction.findMany({
      where: { billId: { in: billIds } },
      select: { id: true },
    });
    const txIds = billTransactions.map((t) => t.id);
    if (txIds.length > 0) {
      const items = await prisma.invoiceItem.findMany({
        where: { billTransactionId: { in: txIds } },
        select: { id: true, invoiceId: true, totalPrice: true },
      });
      const removedByInvoice = new Map<string, number>();
      for (const item of items) {
        removedByInvoice.set(item.invoiceId, (removedByInvoice.get(item.invoiceId) || 0) + (item.totalPrice || 0));
      }
      await prisma.$transaction(async (tx) => {
        await tx.invoiceItem.deleteMany({ where: { billTransactionId: { in: txIds } } });
        for (const [invoiceId, removed] of removedByInvoice) {
          const invoice = await tx.invoice.findUnique({
            where: { id: invoiceId },
            select: { subtotal: true, taxAmount: true, paidAmount: true },
          });
          if (!invoice) continue;
          const subtotal = Math.max(0, (invoice.subtotal || 0) - removed);
          const totalAmount = subtotal + (invoice.taxAmount || 0);
          await tx.invoice.update({
            where: { id: invoiceId },
            data: {
              subtotal,
              totalAmount,
              outstandingAmount: Math.max(0, totalAmount - (invoice.paidAmount || 0)),
            },
          });
        }
      });
    }

    // Delete the bills — cascades handle PvcCalculation, BillTransaction, BillClassificationEntry, etc.
    const deletedBills = await prisma.bill.deleteMany({
      where: {
        id: {
          in: billIds
        }
      }
    });

    for (const contractId of affectedContractIds) {
      await recalculateCumulativePvcForContract(contractId);
      const remainingBills = await prisma.bill.findMany({
        where: { contractId },
        select: { id: true },
      });
      // By tag: cached reports carry `bill:<id>`, and the key format these patterns
      // were written against has already changed once without them noticing.
      for (const remainingBill of remainingBills) {
        advancedCache.invalidateByTag(`bill:${remainingBill.id}`);
      }
    }
    for (const deletedBill of billsToDelete) {
      advancedCache.invalidateByTag(`bill:${deletedBill.id}`);
    }

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
