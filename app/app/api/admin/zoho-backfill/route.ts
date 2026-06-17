import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { validateAdminAccess } from '@/lib/role-auth';
import { createZohoInvoice } from '@/lib/zoho-books';

export const dynamic = 'force-dynamic';

async function getTransactionsWithUsers() {
  const transactions = await prisma.razorpayTransaction.findMany({
    where: { status: 'success' },
    orderBy: { completedAt: 'asc' },
  });

  const userIds = [...new Set(transactions.map(t => t.userId))];
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true, email: true, gstin: true },
  });
  const userMap = new Map(users.map(u => [u.id, u]));

  return transactions.map(t => ({ ...t, user: userMap.get(t.userId) }));
}

// GET /api/admin/zoho-backfill — preview how many transactions need invoices
export async function GET(request: NextRequest) {
  const { authorized, message } = await validateAdminAccess(request);
  if (!authorized) return NextResponse.json({ error: message || 'Admin access required' }, { status: 403 });

  const transactions = await getTransactionsWithUsers();

  return NextResponse.json({
    total: transactions.length,
    transactions: transactions.map(t => ({
      orderId: t.orderId,
      email: t.user?.email,
      name: t.user?.name,
      gstin: t.user?.gstin,
      placeOfSupply: t.user?.gstin ? t.user.gstin.substring(0, 2) : null,
      creditAmount: t.creditAmount,
      gstAmount: t.gstAmount,
      totalAmount: t.totalAmount,
      completedAt: t.completedAt,
    })),
  });
}

// POST /api/admin/zoho-backfill — create Zoho invoices for all past successful payments
export async function POST(request: NextRequest) {
  const { authorized, message } = await validateAdminAccess(request);
  if (!authorized) return NextResponse.json({ error: message || 'Admin access required' }, { status: 403 });

  const transactions = await getTransactionsWithUsers();
  const results: { orderId: string; status: 'created' | 'failed'; invoiceNumber?: string; error?: string }[] = [];

  for (const txn of transactions) {
    if (!txn.user?.email) {
      results.push({ orderId: txn.orderId, status: 'failed', error: 'No user email' });
      continue;
    }

    try {
      const invoice = await createZohoInvoice({
        customerName: txn.user.name || txn.user.email,
        customerEmail: txn.user.email,
        gstin: txn.user.gstin,
        creditAmount: txn.creditAmount,
        gstAmount: txn.gstAmount,
        totalAmount: txn.totalAmount,
        razorpayOrderId: txn.orderId,
        razorpayPaymentId: txn.razorpayPaymentId || txn.orderId,
      });
      results.push({ orderId: txn.orderId, status: 'created', invoiceNumber: invoice.invoiceNumber });
    } catch (e: any) {
      results.push({ orderId: txn.orderId, status: 'failed', error: e.message });
    }

    // Small delay to avoid Zoho rate limits
    await new Promise(r => setTimeout(r, 300));
  }

  const created = results.filter(r => r.status === 'created').length;
  const failed = results.filter(r => r.status === 'failed').length;

  return NextResponse.json({ total: transactions.length, created, failed, results });
}
