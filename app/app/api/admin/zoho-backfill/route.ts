import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { validateAdminAccess } from '@/lib/role-auth';
import { createZohoInvoice } from '@/lib/zoho-books';

export const dynamic = 'force-dynamic';

// GET /api/admin/zoho-backfill — preview how many transactions need invoices
export async function GET(request: NextRequest) {
  const { authorized, message } = await validateAdminAccess(request);
  if (!authorized) return NextResponse.json({ error: message || 'Admin access required' }, { status: 403 });

  const transactions = await prisma.razorpayTransaction.findMany({
    where: { status: 'success' },
    include: { user: { select: { name: true, email: true } } },
    orderBy: { completedAt: 'asc' },
  });

  return NextResponse.json({
    total: transactions.length,
    transactions: transactions.map(t => ({
      orderId: t.orderId,
      email: t.user?.email,
      name: t.user?.name,
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

  const transactions = await prisma.razorpayTransaction.findMany({
    where: { status: 'success' },
    include: { user: { select: { name: true, email: true } } },
    orderBy: { completedAt: 'asc' },
  });

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
