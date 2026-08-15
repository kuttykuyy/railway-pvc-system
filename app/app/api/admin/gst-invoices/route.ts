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

    const { transactionId, invoiceId } = await request.json().catch(() => ({}));

    // { invoiceId }: reconcile an already-generated app invoice with Zoho — create the
    // missing sales invoice there, or carry a GSTIN across to an existing one. The
    // payments this page deals in are exactly the ones whose Zoho copy often never
    // happened (pre-integration transactions, outages at payment time).
    if (invoiceId) {
      const appInvoice = await prisma.gstInvoice.findUnique({ where: { id: invoiceId } });
      if (!appInvoice) {
        return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
      }
      const tx = await prisma.razorpayTransaction.findUnique({
        where: { id: appInvoice.razorpayTransactionId },
      });
      if (!tx) {
        return NextResponse.json({ error: 'The payment behind this invoice no longer exists' }, { status: 404 });
      }
      try {
        const { findZohoInvoiceByReference, createZohoInvoice, syncGstinToZoho } = await import('@/lib/zoho-books');
        const existingZoho = await findZohoInvoiceByReference(tx.orderId);
        if (existingZoho) {
          // Already in the ledger. If the app invoice carries a GSTIN, make sure the
          // ledger copy does too — the common drift between the two.
          if (appInvoice.customerGstin) {
            const sync = await syncGstinToZoho({
              customerEmail: appInvoice.customerEmail,
              gstin: appInvoice.customerGstin,
              razorpayOrderId: tx.orderId,
            });
            return NextResponse.json({
              success: true,
              zoho: { pushed: false, detail: `Zoho already has ${existingZoho.invoiceNumber}; ${sync.detail}` },
            });
          }
          return NextResponse.json({
            success: true,
            zoho: { pushed: false, detail: `Zoho already has invoice ${existingZoho.invoiceNumber} for this payment` },
          });
        }
        const created = await createZohoInvoice({
          customerName: appInvoice.customerName,
          customerEmail: appInvoice.customerEmail,
          gstin: appInvoice.customerGstin,
          creditAmount: tx.creditAmount,
          gstAmount: tx.gstAmount,
          totalAmount: tx.totalAmount,
          razorpayOrderId: tx.orderId,
          razorpayPaymentId: tx.razorpayPaymentId || tx.orderId,
        });
        // Two admins clicking at the same moment both find nothing and both create —
        // collapse any duplicates immediately, keeping the oldest.
        const { dedupeZohoInvoicesByReference } = await import('@/lib/zoho-books');
        const dedupe = await dedupeZohoInvoicesByReference(tx.orderId).catch(() => ({ deleted: 0 }));
        if (dedupe.deleted > 0) {
          logger.log(`[Admin GST Invoices] Removed ${dedupe.deleted} duplicate Zoho invoice(s) for ${tx.orderId}`);
        }
        logger.log(`[Admin GST Invoices] Zoho invoice ${created.invoiceNumber} pushed by ${admin.email} for app invoice ${appInvoice.invoiceNumber}`);
        return NextResponse.json({
          success: true,
          zoho: { pushed: true, detail: `Zoho invoice ${created.invoiceNumber} created` },
        });
      } catch (zohoError: any) {
        return NextResponse.json(
          { error: `Zoho push failed: ${zohoError?.message || zohoError}` },
          { status: 502 }
        );
      }
    }

    if (!transactionId) {
      return NextResponse.json({ error: 'transactionId or invoiceId is required' }, { status: 400 });
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
    // Zoho Books is the invoice of record; this row mirrors it. Without Zoho's number
    // a backfill would start a second series for a supply Zoho has already invoiced.
    // Recorded on the payment when Zoho issued it; asking Zoho again is the fallback.
    let numberOfRecord = ((transaction as any)?.notes?.zohoInvoiceNumber as string) || undefined;
    if (!numberOfRecord) {
      try {
        const { findZohoInvoiceByReference } = await import('@/lib/zoho-books');
        const zoho = await findZohoInvoiceByReference(transaction.razorpayOrderId);
        numberOfRecord = zoho?.invoiceNumber;
      } catch (zohoError: any) {
        logger.log('[Admin GST Invoices] Could not reach Zoho for the invoice number:', zohoError?.message);
      }
    }
    if (!numberOfRecord) {
      return NextResponse.json(
        {
          error: 'No Zoho invoice exists for this payment yet, and Zoho is the invoice of '
            + 'record. Create it in Zoho Books first, then generate here.',
        },
        { status: 409 },
      );
    }

    const invoice = await createGstInvoice({
      invoiceNumber: numberOfRecord,
      userId: customer.id,
      razorpayTransactionId: transaction.id,
      customerName: customer.name || customer.email || 'Customer',
      customerEmail: customer.email || '',
      customerPhone: customer.phone || undefined,
      // B2C: no GSTIN, intrastate split — exactly how the payment was taxed.
      creditAmount: transaction.creditAmount,
      isInterstate: false,
      // Taken from the payment, not assumed: the basis it was charged on and the date
      // the money arrived. This route backfills old payments, which is exactly where
      // "now" produced invoices dated months after the supply.
      basis: (transaction as any)?.notes?.gstOption === 'include' ? 'inclusive' : 'exclusive',
      invoiceDate: transaction.completedAt ?? transaction.createdAt ?? undefined,
    });

    logger.log(`[Admin GST Invoices] B2C invoice ${invoice.invoiceNumber} generated by ${admin.email} for tx ${transaction.id}`);

    // The books must agree: payments normally reach Zoho the moment they verify, but
    // the very payments that end up here are the ones where that often did not happen —
    // old transactions predating the integration, or a Zoho outage at payment time.
    // Push the missing sales invoice now (B2C, no GSTIN); skip when one already exists,
    // since a second would double the ledger. Best-effort: the app-side invoice above
    // stands whatever Zoho says, and the outcome is reported to the admin either way.
    let zoho: { pushed: boolean; detail: string } = { pushed: false, detail: '' };
    try {
      const { findZohoInvoiceByReference, createZohoInvoice } = await import('@/lib/zoho-books');
      const existing_zoho = await findZohoInvoiceByReference(transaction.orderId);
      if (existing_zoho) {
        zoho = { pushed: false, detail: `Zoho already has invoice ${existing_zoho.invoiceNumber} for this payment` };
      } else {
        const created = await createZohoInvoice({
          customerName: customer.name || customer.email || 'Customer',
          customerEmail: customer.email || '',
          gstin: null,
          creditAmount: transaction.creditAmount,
          gstAmount: transaction.gstAmount,
          totalAmount: transaction.totalAmount,
          razorpayOrderId: transaction.orderId,
          razorpayPaymentId: transaction.razorpayPaymentId || transaction.orderId,
        });
        const { dedupeZohoInvoicesByReference } = await import('@/lib/zoho-books');
        await dedupeZohoInvoicesByReference(transaction.orderId).catch(() => ({}));
        zoho = { pushed: true, detail: `Zoho invoice ${created.invoiceNumber} created` };
      }
    } catch (zohoError: any) {
      zoho = { pushed: false, detail: `Zoho push failed: ${zohoError?.message || zohoError}` };
      console.error('[Admin GST Invoices] Zoho push failed:', zohoError);
    }
    logger.log(`[Admin GST Invoices] Zoho outcome for tx ${transaction.id}: ${zoho.detail}`);

    return NextResponse.json({ success: true, invoice, zoho });
  } catch (error) {
    console.error('[Admin GST Invoices] B2C generation failed:', error);
    return NextResponse.json(
      { error: `Invoice generation failed: ${error instanceof Error ? error.message : 'unknown error'}` },
      { status: 500 }
    );
  }
}
