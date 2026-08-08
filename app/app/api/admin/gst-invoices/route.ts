import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

// Mark route as dynamic
export const dynamic = 'force-dynamic';
export const revalidate = 0;

// GET /api/admin/gst-invoices - Get all GST invoices (admin only)
export async function GET(request: NextRequest) {
  logger.log('[Admin GST Invoices] API route called');
  try {
    const session = await getServerSession(authOptions);
    logger.log('[Admin GST Invoices] Session:', session ? 'exists' : 'missing');
    
    if (!session?.user?.email) {
      logger.log('[Admin GST Invoices] No session or email found');
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    logger.log('[Admin GST Invoices] User email:', session.user.email);

    // Get user and check if admin
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    logger.log('[Admin GST Invoices] User found:', user ? `${user.email} (${user.role})` : 'not found');

    if (!user || user.role !== 'admin') {
      logger.log('[Admin GST Invoices] User not admin or not found');
      return NextResponse.json(
        { error: 'Unauthorized. Admin access required.' },
        { status: 403 }
      );
    }

    // Get all generated GST invoices with user information
    logger.log('[Admin GST Invoices] Fetching GST invoices...');
    const invoices = await prisma.gstInvoice.findMany({
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const invoicedTransactionIds = new Set(
      invoices.map((invoice) => invoice.razorpayTransactionId)
    );

    // Successful payments may not have a GST invoice yet if the user skipped
    // the billing-details dialog after payment. Surface those as pending rows
    // so admins can see every paid top-up from this page.
    const pendingTransactions = await prisma.razorpayTransaction.findMany({
      where: {
        status: 'success',
        id: {
          notIn: Array.from(invoicedTransactionIds),
        },
      },
      orderBy: {
        completedAt: 'desc',
      },
    });

    const pendingUserIds = Array.from(new Set(pendingTransactions.map((tx) => tx.userId)));
    const pendingUsers = await prisma.user.findMany({
      where: {
        id: {
          in: pendingUserIds,
        },
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
      },
    });
    const pendingUserById = new Map(pendingUsers.map((pendingUser) => [pendingUser.id, pendingUser]));

    const pendingInvoiceRows = pendingTransactions.map((transaction) => {
      const transactionUser = pendingUserById.get(transaction.userId);
      const invoiceDate = transaction.completedAt || transaction.updatedAt || transaction.createdAt;

      return {
        id: `pending-${transaction.id}`,
        invoiceNumber: `PENDING-${transaction.orderId}`,
        invoiceDate,
        customerName: transactionUser?.name || transactionUser?.email || 'Unknown user',
        customerEmail: transactionUser?.email || 'Unknown email',
        customerPhone: transactionUser?.phone || null,
        customerGstin: null,
        subtotal: transaction.creditAmount,
        cgst: transaction.gstAmount / 2,
        sgst: transaction.gstAmount / 2,
        igst: 0,
        totalGst: transaction.gstAmount,
        totalAmount: transaction.totalAmount,
        description: `Credit Top-up - billing details pending`,
        isInterstate: false,
        status: 'pending_billing_details',
        createdAt: transaction.createdAt,
        updatedAt: transaction.updatedAt,
        razorpayTransactionId: transaction.id,
        razorpayOrderId: transaction.orderId,
        user: {
          id: transaction.userId,
          name: transactionUser?.name || null,
          email: transactionUser?.email || 'Unknown email',
        },
      };
    });

    const allRows = [...invoices, ...pendingInvoiceRows].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    logger.log(`[Admin GST Invoices] Found ${invoices.length} generated invoices and ${pendingInvoiceRows.length} pending paid transactions`);
    return NextResponse.json({
      invoices: allRows,
      counts: {
        generated: invoices.length,
        pending: pendingInvoiceRows.length,
        total: allRows.length,
      },
    });
  } catch (error: any) {
    console.error('[Admin GST Invoices] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch GST invoices' },
      { status: 500 }
    );
  }
}


/**
 * POST /api/admin/gst-invoices — generate the invoice for a paid transaction whose user
 * never filled the billing dialog.
 *
 * Most who skip it are unregistered (non-GST) customers with no GSTIN to give and no
 * reason to care — but the SUPPLIER's duty to invoice does not depend on the customer
 * holding a GSTIN. Those payments sat as "Awaiting Details" forever, a dead end. An
 * admin can now issue the invoice B2C: the customer's account name and email stand in
 * for the never-submitted form, GSTIN stays empty, and tax stays CGST+SGST — without a
 * customer GSTIN there is no evidence of another state, and the split was already
 * charged that way at payment.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const admin = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!admin || admin.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized. Admin access required.' }, { status: 403 });
    }

    const { transactionId } = await request.json().catch(() => ({}));
    if (!transactionId) {
      return NextResponse.json({ error: 'transactionId is required' }, { status: 400 });
    }

    const transaction = await prisma.razorpayTransaction.findUnique({ where: { id: transactionId } });
    if (!transaction) {
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
    }
    if (transaction.status !== 'success') {
      return NextResponse.json({ error: 'Only successful payments can be invoiced' }, { status: 400 });
    }

    const existing = await prisma.gstInvoice.findUnique({
      where: { razorpayTransactionId: transaction.id },
    });
    if (existing) {
      return NextResponse.json({ error: `Invoice ${existing.invoiceNumber} already exists for this payment` }, { status: 409 });
    }

    const customer = await prisma.user.findUnique({ where: { id: transaction.userId } });
    if (!customer) {
      return NextResponse.json({ error: 'The paying user no longer exists' }, { status: 404 });
    }

    const { createGstInvoice } = await import('@/lib/gst-invoice');
    const invoice = await createGstInvoice({
      userId: customer.id,
      razorpayTransactionId: transaction.id,
      customerName: customer.name || customer.email || 'Customer',
      customerEmail: customer.email || '',
      customerPhone: customer.phone || undefined,
      // B2C: no GSTIN, intrastate split — exactly how the payment was taxed.
      creditAmount: transaction.creditAmount,
      isInterstate: false,
    });

    logger.log(`[Admin GST Invoices] B2C invoice ${invoice.invoiceNumber} generated by ${admin.email} for tx ${transaction.id}`);
    return NextResponse.json({ success: true, invoice });
  } catch (error) {
    console.error('[Admin GST Invoices] B2C generation failed:', error);
    return NextResponse.json(
      { error: `Invoice generation failed: ${error instanceof Error ? error.message : 'unknown error'}` },
      { status: 500 }
    );
  }
}
