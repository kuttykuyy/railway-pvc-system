import { prisma } from './db';
import { mergePaymentNotes, type PaymentRow } from './payment-credit';
import { logger } from './logger';

/**
 * What happens AFTER a top-up is credited: the confirmation message, the tax invoice.
 *
 * Every one of these is best-effort and none of them can fail the credit — the money is
 * already in the wallet by the time this runs. A WhatsApp outage or a Zoho hiccup must
 * never look to the customer like their payment failed, because it did not.
 *
 * Gateway-neutral: it is handed the payment row and the user, and it does not care which
 * gateway took the money. The one thing still tied to Razorpay is the referral reward,
 * whose idempotency reads the razorpay_transactions table; that is called from the
 * Razorpay path only, and is noted where a future generalisation would slot in.
 */
export async function runPaymentSideEffects(args: {
  payment: PaymentRow;
  user: { id: string; email: string; name: string | null; phone: string | null; gstin?: string | null };
  creditsAdded: number;
  newBalance: number;
}): Promise<void> {
  const { payment, user, creditsAdded, newBalance } = args;

  // ── WhatsApp confirmation ────────────────────────────────────────────────────
  if (user.phone) {
    try {
      const { sendPaymentConfirmation } = await import('./whatsapp-mydreams');
      const at = new Date();
      const result = await sendPaymentConfirmation(
        user.phone,
        user.name || user.email,
        payment.orderId,
        creditsAdded,
        payment.gstAmount,
        payment.totalAmount,
        newBalance,
        at,
      );
      try {
        const { format } = await import('date-fns');
        const ist = new Date(at.getTime() + 5.5 * 60 * 60 * 1000);
        await prisma.whatsAppLog.create({
          data: {
            billId: null,
            userId: user.id,
            phoneNumber: user.phone,
            recipientName: user.name || user.email,
            template: 'payment_confirmation',
            parameters: [
              user.name || user.email,
              payment.orderId,
              `Rs. ${creditsAdded.toFixed(2)}`,
              `Rs. ${payment.gstAmount.toFixed(2)}`,
              `Rs. ${payment.totalAmount.toFixed(2)}`,
              `Rs. ${newBalance.toFixed(2)}`,
              format(ist, "dd-MMM-yyyy 'at' hh:mm a"),
            ],
            status: result.success ? 'sent' : 'failed',
            messageId: result.messageId || null,
            errorMessage: result.success ? null : (result.error || 'Unknown error'),
            pdfUrl: null,
            sentAt: new Date(),
          },
        });
      } catch (logError) {
        logger.warn('[payment-side-effects] could not log the WhatsApp message:', logError);
      }
    } catch (error) {
      logger.warn('[payment-side-effects] WhatsApp confirmation failed:', error);
    }
  }

  // ── Zoho Books invoice ───────────────────────────────────────────────────────
  try {
    const { createZohoInvoice } = await import('./zoho-books');
    const zoho = await createZohoInvoice({
      customerName: user.name || user.email,
      customerEmail: user.email,
      gstin: user.gstin ?? null,
      creditAmount: payment.creditAmount,
      gstAmount: payment.gstAmount,
      totalAmount: payment.totalAmount,
      // The Zoho helper names these razorpay* for historical reasons; they are just the
      // order and payment references, and Cashfree's fit the same slots.
      razorpayOrderId: payment.orderId,
      razorpayPaymentId: payment.orderId,
    });
    await mergePaymentNotes(payment.id, {
      zohoInvoiceNumber: zoho.invoiceNumber,
      zohoInvoiceId: zoho.invoiceId,
    });
    logger.log('[payment-side-effects] Zoho invoice', zoho.invoiceNumber, 'for', payment.orderId);
  } catch (error: any) {
    logger.warn('[payment-side-effects] Zoho invoice failed:', error?.message || error);
  }
}
