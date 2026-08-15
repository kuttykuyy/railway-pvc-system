import { logger } from '@/lib/logger';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import jwt from 'jsonwebtoken';
import { authOptions, getNextAuthSecret } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { createGstInvoice } from '@/lib/gst-invoice';
import { sendBillPDFNotification, isMyDreamsWhatsAppConfigured } from '@/lib/whatsapp-mydreams';
import { validateGstinFormat, validateEmailFormat } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/**
 * POST /api/gst-invoices/generate
 * Generate GST invoice with billing details after payment
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get user from database
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    const body = await request.json();
    const {
      transactionId,
      customerName,
      customerEmail,
      customerPhone,
      customerGstin,
      customerAddress,
    } = body;

    // Validate required fields
    if (!transactionId || !customerName || !customerEmail) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Validate email format
    if (!validateEmailFormat(customerEmail)) {
      return NextResponse.json(
        { error: 'Please enter a valid email address' },
        { status: 400 }
      );
    }

    // Validate GSTIN format if provided
    if (customerGstin && customerGstin.trim() && !validateGstinFormat(customerGstin)) {
      return NextResponse.json(
        { error: 'Please enter a valid 15-character GSTIN (e.g., 22AAAAA0000A1Z5)' },
        { status: 400 }
      );
    }

    // Find the transaction
    const transaction = await prisma.razorpayTransaction.findUnique({
      where: { id: transactionId },
    });

    if (!transaction) {
      return NextResponse.json(
        { error: 'Transaction not found' },
        { status: 404 }
      );
    }

    // Verify transaction belongs to user
    if (transaction.userId !== user.id) {
      return NextResponse.json(
        { error: 'Unauthorized - Transaction does not belong to user' },
        { status: 403 }
      );
    }

    // Check if transaction is successful
    if (transaction.status !== 'success') {
      return NextResponse.json(
        { error: 'Transaction is not successful' },
        { status: 400 }
      );
    }

    // Check if invoice already exists for this transaction
    const existingInvoice = await prisma.gstInvoice.findFirst({
      where: { razorpayTransactionId: transaction.id },
    });

    if (existingInvoice) {
      return NextResponse.json(
        { error: 'Invoice already generated for this transaction', invoice: existingInvoice },
        { status: 400 }
      );
    }

    // Zoho Books is the invoice of record. Take ITS number rather than minting one,
    // or the same payment ends up invoiced twice under two unrelated series — the
    // customer holding one number while the return is filed under the other.
    // Recorded on the payment when Zoho issued it; asking Zoho again is the fallback.
    // Zoho is asked first and wins when it answers, since it also carries the amounts
    // and the tax split. The number noted at payment time is the fallback for when
    // Zoho cannot be reached — enough to issue the copy, though then the amounts come
    // from our own arithmetic.
    let numberOfRecord = ((transaction as any)?.notes?.zohoInvoiceNumber as string) || undefined;
    let figuresOfRecord: any;
    try {
      const { findZohoInvoiceByReference } = await import('@/lib/zoho-books');
      const zoho = await findZohoInvoiceByReference(transaction.razorpayOrderId);
      if (zoho) {
        numberOfRecord = zoho.invoiceNumber;
        figuresOfRecord = zoho.figures;
      }
    } catch (zohoError: any) {
      logger.log('[GST Invoice] Could not reach Zoho for the invoice of record:', zohoError?.message);
    }
    if (!numberOfRecord) {
      // Better no document than a second series: the customer would be holding a
      // number that appears in no return.
      return NextResponse.json(
        {
          error: 'Your invoice is still being issued. Please try again in a few minutes — '
            + 'if it keeps failing, contact support and it will be sent to you.',
        },
        { status: 503 },
      );
    }

    // Generate GST invoice
    const gstInvoice = await createGstInvoice({
      invoiceNumber: numberOfRecord,
      figures: figuresOfRecord,
      userId: user.id,
      razorpayTransactionId: transaction.id,
      customerName: customerName.trim(),
      customerEmail: customerEmail.trim().toLowerCase(),
      customerPhone: customerPhone?.trim() || undefined,
      customerGstin: customerGstin?.trim().toUpperCase() || undefined,
      customerAddress: customerAddress?.trim() || undefined,
      creditAmount: transaction.creditAmount,
      isInterstate: false, // Default to intrastate (Tamil Nadu)
      // The tax basis the payment was actually taken on, and the date the money
      // arrived. Reading them from the payment rather than assuming keeps the invoice
      // in step with the receipt — assuming is how three invoices came to claim ₹180
      // of tax on a ₹1,000 payment that held ₹152.54, and how seven came to be dated
      // the day a catch-up script ran instead of the day of supply.
      basis: (transaction as any)?.notes?.gstOption === 'include' ? 'inclusive' : 'exclusive',
      invoiceDate: transaction.completedAt ?? transaction.createdAt ?? undefined,
    });

    logger.log(`[GST Invoice] Generated: ${gstInvoice.invoiceNumber} for transaction ${transaction.id}`);

    // A GSTIN arriving in this dialog exists nowhere else: Zoho's invoice was created
    // at payment time from the profile (often GSTIN-less), and the customer's
    // input-credit claim reads from Zoho, not from our PDF. Carry it across — and into
    // the profile, so the customer's NEXT payment is invoiced right from the start.
    // Best-effort on both counts: the app-side invoice above is already made and must
    // not fail because the ledger copy could not be touched.
    const submittedGstin = customerGstin?.trim().toUpperCase();
    if (submittedGstin) {
      if (!user.gstin) {
        await prisma.user.update({ where: { id: user.id }, data: { gstin: submittedGstin } })
          .catch((err) => console.error('[GST Invoice] Could not save GSTIN to profile:', err));
      }
      try {
        const { syncGstinToZoho } = await import('@/lib/zoho-books');
        const sync = await syncGstinToZoho({
          customerEmail: user.email || customerEmail.trim().toLowerCase(),
          gstin: submittedGstin,
          razorpayOrderId: transaction.orderId,
        });
        console.log(`[GST Invoice] Zoho GSTIN sync: contact=${sync.contactUpdated} invoice=${sync.invoiceUpdated} — ${sync.detail}`);
      } catch (zohoErr: any) {
        console.error('[GST Invoice] Zoho GSTIN sync failed:', zohoErr?.message || zohoErr);
      }
    }

    // Send WhatsApp notification if phone number is provided and WhatsApp is configured
    if (customerPhone && customerPhone.trim()) {
      const whatsappConfigured = await isMyDreamsWhatsAppConfigured();
      
      if (whatsappConfigured) {
        logger.log(`[GST Invoice] Attempting to send WhatsApp notification to ${customerPhone}`);
        
        // Public PDF URL protected by a signed, invoice-scoped token so the link is
        // shareable via WhatsApp but the bare invoice id alone cannot fetch the PII.
        // 30 days, not 365: the link is a bearer token for a document carrying GSTIN
        // and customer PII, with no revocation. A month covers "download it later";
        // after that the invoice is still on the user's own invoices page behind login.
        const invoiceToken = jwt.sign(
          { invoiceId: gstInvoice.id },
          getNextAuthSecret(),
          { expiresIn: '30d' }
        );
        const pdfUrl = `https://irpvc.in/api/public/gst-invoice-pdf/${gstInvoice.id}?token=${encodeURIComponent(invoiceToken)}`;
        const pdfFileName = `GST_Invoice_${gstInvoice.invoiceNumber}.pdf`;
        
        // Format date for WhatsApp message
        const invoiceDate = new Date(gstInvoice.invoiceDate).toLocaleDateString('en-IN', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        });
        
        // Format amounts with Rs. prefix (without currency symbols for WhatsApp)
        const formatAmount = (amount: number) => {
          return amount.toFixed(2);
        };
        
        try {
          const templateParams = [
            customerName.trim(),                  // {{1}} - Customer Name
            gstInvoice.invoiceNumber,             // {{2}} - Invoice Number
            invoiceDate,                          // {{3}} - Invoice Date
            formatAmount(gstInvoice.subtotal),    // {{4}} - Subtotal
            formatAmount(gstInvoice.cgst),        // {{5}} - CGST
            formatAmount(gstInvoice.sgst),        // {{6}} - SGST
            formatAmount(gstInvoice.totalAmount), // {{7}} - Total Amount
          ];
          
          const whatsappResult = await sendBillPDFNotification(
            customerPhone.trim(),
            gstInvoice.invoiceNumber,
            pdfUrl,
            customerName.trim(),
            pdfFileName,
            'gst_invoice_notification', // Template name
            templateParams
          );

          // Log WhatsApp message to database
          try {
            await prisma.whatsAppLog.create({
              data: {
                userId: user.id,
                phoneNumber: customerPhone.trim(),
                recipientName: customerName.trim(),
                template: 'gst_invoice_notification',
                parameters: JSON.stringify({
                  customerName: customerName.trim(),
                  invoiceNumber: gstInvoice.invoiceNumber,
                  invoiceDate: invoiceDate,
                  subtotal: formatAmount(gstInvoice.subtotal),
                  cgst: formatAmount(gstInvoice.cgst),
                  sgst: formatAmount(gstInvoice.sgst),
                  totalAmount: formatAmount(gstInvoice.totalAmount),
                }),
                status: whatsappResult.success ? 'sent' : 'failed',
                messageId: whatsappResult.messageId || null,
                errorMessage: whatsappResult.error || null,
                pdfUrl: pdfUrl,
                sentAt: new Date(),
              },
            });
            logger.log(`[GST Invoice] WhatsApp log saved to database`);
          } catch (logError: any) {
            console.error(`[GST Invoice] ⚠️ Failed to save WhatsApp log:`, logError);
          }

          if (whatsappResult.success) {
            logger.log(`[GST Invoice] ✅ WhatsApp notification sent successfully - Message ID: ${whatsappResult.messageId}`);
          } else {
            console.error(`[GST Invoice] ⚠️ Failed to send WhatsApp notification: ${whatsappResult.error}`);
          }
        } catch (whatsappError: any) {
          // Don't fail the request if WhatsApp fails
          console.error(`[GST Invoice] ⚠️ WhatsApp notification error:`, whatsappError);
        }
      } else {
        logger.log(`[GST Invoice] ℹ️ WhatsApp not configured, skipping notification`);
      }
    } else {
      logger.log(`[GST Invoice] ℹ️ No phone number provided, skipping WhatsApp notification`);
    }

    return NextResponse.json({
      success: true,
      id: gstInvoice.id,
      invoiceNumber: gstInvoice.invoiceNumber,
      message: 'GST invoice generated successfully',
    });
  } catch (error: any) {
    console.error('[GST Invoice] Generation error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate GST invoice' },
      { status: 500 }
    );
  }
}

