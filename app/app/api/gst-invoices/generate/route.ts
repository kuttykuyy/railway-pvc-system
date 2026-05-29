
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
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

    // Generate GST invoice
    const gstInvoice = await createGstInvoice({
      userId: user.id,
      razorpayTransactionId: transaction.id,
      customerName: customerName.trim(),
      customerEmail: customerEmail.trim().toLowerCase(),
      customerPhone: customerPhone?.trim() || undefined,
      customerGstin: customerGstin?.trim().toUpperCase() || undefined,
      customerAddress: customerAddress?.trim() || undefined,
      creditAmount: transaction.creditAmount,
      isInterstate: false, // Default to intrastate (Tamil Nadu)
    });

    console.log(`[GST Invoice] Generated: ${gstInvoice.invoiceNumber} for transaction ${transaction.id}`);

    // Send WhatsApp notification if phone number is provided and WhatsApp is configured
    if (customerPhone && customerPhone.trim()) {
      const whatsappConfigured = await isMyDreamsWhatsAppConfigured();
      
      if (whatsappConfigured) {
        console.log(`[GST Invoice] Attempting to send WhatsApp notification to ${customerPhone}`);
        
        // Public PDF URL (no authentication required for WhatsApp download)
        const pdfUrl = `https://irpvc.in/api/public/gst-invoice-pdf/${gstInvoice.id}`;
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
            console.log(`[GST Invoice] WhatsApp log saved to database`);
          } catch (logError: any) {
            console.error(`[GST Invoice] ⚠️ Failed to save WhatsApp log:`, logError);
          }

          if (whatsappResult.success) {
            console.log(`[GST Invoice] ✅ WhatsApp notification sent successfully - Message ID: ${whatsappResult.messageId}`);
          } else {
            console.error(`[GST Invoice] ⚠️ Failed to send WhatsApp notification: ${whatsappResult.error}`);
          }
        } catch (whatsappError: any) {
          // Don't fail the request if WhatsApp fails
          console.error(`[GST Invoice] ⚠️ WhatsApp notification error:`, whatsappError);
        }
      } else {
        console.log(`[GST Invoice] ℹ️ WhatsApp not configured, skipping notification`);
      }
    } else {
      console.log(`[GST Invoice] ℹ️ No phone number provided, skipping WhatsApp notification`);
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
