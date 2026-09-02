import { logger } from '@/lib/logger';

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/lib/db';
import { sendPaymentConfirmation } from '@/lib/whatsapp-mydreams';
import { sendSlackAlert } from '@/lib/slack-webhook';
import { processReferralReward } from '@/lib/referrals';
import { TELEGRAM_REPORT_NOTE_KIND } from '@/lib/telegram-payment';

/**
 * POST /api/razorpay/webhook
 * Handles Razorpay webhook events (payment.authorized, payment.captured, payment.failed)
 * This ensures payments are verified server-side even if client-side verification fails
 */
export async function POST(request: NextRequest) {
  const requestId = `WEBHOOK_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  logger.log(`[${requestId}] Razorpay webhook received`);

  try {
    // Get raw body for signature verification
    const body = await request.text();
    const signature = request.headers.get('x-razorpay-signature');

    if (!signature) {
      console.error(`[${requestId}] Missing webhook signature`);
      await sendSlackAlert('critical', 'Razorpay webhook missing signature', {
        'Request ID': requestId,
        'Source IP': request.headers.get('x-forwarded-for') || 'unknown',
        'User Agent': request.headers.get('user-agent') || 'unknown'
      });
      return NextResponse.json(
        { error: 'Missing signature' },
        { status: 400 }
      );
    }

    // Verify webhook signature
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error(`[${requestId}] Webhook secret not configured`);
      await sendSlackAlert('critical', 'Razorpay webhook secret not configured', {
        'Request ID': requestId,
        'Time': new Date().toISOString()
      });
      return NextResponse.json(
        { error: 'Webhook not configured' },
        { status: 500 }
      );
    }

    logger.log(`[${requestId}] Body length: ${body.length}`);

    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(body)
      .digest('hex');

    // Constant-time comparison to avoid signature timing attacks.
    const signatureBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSignature);
    const signatureValid = signatureBuffer.length === expectedBuffer.length
      && crypto.timingSafeEqual(signatureBuffer, expectedBuffer);

    if (!signatureValid) {
      console.error(`[${requestId}] Invalid webhook signature`);
      await sendSlackAlert('critical', 'Razorpay webhook invalid signature', {
        'Request ID': requestId,
        'Source IP': request.headers.get('x-forwarded-for') || 'unknown',
        'User Agent': request.headers.get('user-agent') || 'unknown',
        'Body Length': String(body.length)
      });
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 401 }
      );
    }

    logger.log(`[${requestId}] Webhook signature verified successfully`);

    // Parse webhook payload
    const event = JSON.parse(body);
    const eventType = event.event;
    const payment = event.payload?.payment?.entity;
    const order = event.payload?.order?.entity;

    logger.log(`[${requestId}] Event type: ${eventType}`);
    logger.log(`[${requestId}] Order ID: ${order?.id || payment?.order_id || 'N/A'}`);
    logger.log(`[${requestId}] Payment ID: ${payment?.id || 'N/A'}`);

    // Telegram pay-per-report payments carry our marker in the notes and have no
    // RazorpayTransaction row, so they're handled here before the wallet flow (which
    // would otherwise log "transaction not found" and alert).
    const telegramNotes =
      event.payload?.payment_link?.entity?.notes || payment?.notes || null;
    if (telegramNotes?.kind === TELEGRAM_REPORT_NOTE_KIND) {
      if (
        eventType === 'payment.captured' ||
        eventType === 'payment.authorized' ||
        eventType === 'payment_link.paid'
      ) {
        const chatId = String(telegramNotes.telegramChatId || '');
        // Which link was paid. A chat can have one unpaid report per bill, so without
        // this the payer would get whichever report was parked last.
        const paymentLinkId = String(
          event.payload?.payment_link?.entity?.id || payment?.payment_link_id || '',
        );
        logger.log(`[${requestId}] Telegram PVC report payment for chat ${chatId} (link ${paymentLinkId || 'n/a'})`);
        if (chatId) {
          try {
            const { renderAndSendPaidReport } = await import('@/lib/telegram-bill-pvc');
            const sent = await renderAndSendPaidReport(chatId, paymentLinkId || undefined);
            logger.log(`[${requestId}] Telegram report ${sent ? 'sent' : 'not pending (already sent?)'}`);
          } catch (err: any) {
            console.error(`[${requestId}] Telegram report delivery failed:`, err);
            try {
              const { sendTelegramMessage } = await import('@/lib/telegram-api');
              await sendTelegramMessage(
                chatId,
                '⚠️ Your payment went through, but I hit a problem building the PDF. Please send the bill PDF again and I will deliver it — you will not be charged twice.',
              );
            } catch { /* nothing more we can do */ }
          }
        }
      }
      return NextResponse.json({ success: true });
    }

    // Handle payment events. Only a CAPTURED payment is money: an authorized one whose
    // auto-capture fails is auto-refunded by Razorpay, and crediting on authorization
    // handed out credits for money that then went back. With payment_capture: 1 the
    // captured event follows authorization within moments, so nothing is delayed —
    // an authorized event that never captures now simply never credits.
    if (eventType === 'payment.captured'
        || (eventType === 'payment.authorized' && payment?.status === 'captured')) {
      await handlePaymentSuccess(requestId, payment);
    } else if (eventType === 'payment.authorized') {
      logger.log(`[${requestId}] payment.authorized (status: ${payment?.status}) — waiting for capture before crediting`);
    } else if (eventType === 'payment.failed') {
      await handlePaymentFailure(requestId, payment);
    } else {
      logger.log(`[${requestId}] Unhandled event type: ${eventType}`);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error(`[${requestId}] Webhook processing error:`, error);
    await sendSlackAlert('critical', 'Razorpay webhook processing error', {
      'Request ID': requestId,
      'Error': error.message || String(error),
      'Time': new Date().toISOString()
    });
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    );
  }
}

async function handlePaymentSuccess(requestId: string, payment: any) {
  logger.log(`[${requestId}] Processing successful payment`);

  const orderId = payment.order_id;
  const paymentId = payment.id;

  // Find transaction
  const transaction = await prisma.razorpayTransaction.findUnique({
    where: { orderId },
  });

  if (!transaction) {
    console.error(`[${requestId}] Transaction not found: ${orderId}`);
    await sendSlackAlert('warning', 'Razorpay webhook: transaction not found', {
      'Request ID': requestId,
      'Order ID': orderId,
      'Payment ID': payment?.id || 'N/A'
    });
    return;
  }

  // Early idempotency check (cheap path); the authoritative guard is the atomic
  // conditional status flip below.
  if (transaction.status === 'success') {
    logger.log(`[${requestId}] Transaction already processed: ${orderId}`);
    return;
  }

  logger.log(`[${requestId}] Processing transaction: ${transaction.id}`);

  // Get user with customer account
  const user = await prisma.user.findUnique({
    where: { id: transaction.userId },
    include: { customerAccount: true },
  });

  if (!user) {
    console.error(`[${requestId}] User not found: ${transaction.userId}`);
    await sendSlackAlert('warning', 'Razorpay webhook: user not found for payment', {
      'Request ID': requestId,
      'Order ID': orderId,
      'User ID': transaction.userId
    });
    return;
  }

  // Credit amount honours the GST option so the webhook and client verify-payment
  // credit the same value regardless of which one wins the race.
  // The credits bought, never the gross paid -- see the matching note in
  // verify-payment. Both paths must grant the same value or the race guard is pointless.
  const creditsToAdd = transaction.creditAmount;

  // Flip the transaction to 'success' and credit the wallet in a single atomic
  // transaction. The conditional update (status not already 'success') ensures the
  // credit is applied exactly once even if the client verify-payment call or a webhook
  // retry processes the same order concurrently.
  const creditResult = await prisma.$transaction(async (tx) => {
    const flip = await tx.razorpayTransaction.updateMany({
      where: { id: transaction.id, status: { not: 'success' } },
      data: {
        razorpayPaymentId: paymentId,
        status: 'success',
        paymentMethod: payment.method,
        completedAt: new Date(),
      },
    });
    if (flip.count === 0) return { credited: false, newBalance: 0 };
    const account = await tx.customerAccount.findUnique({
      where: { userId: user.id },
      select: { creditBalance: true },
    });
    const balanceBefore = account?.creditBalance ?? 0;
    const balanceAfter = balanceBefore + creditsToAdd;
    await tx.customerAccount.upsert({
      where: { userId: user.id },
      update: { creditBalance: balanceAfter },
      create: {
        userId: user.id,
        creditBalance: creditsToAdd,
        currentMonthBills: 0,
        outstandingAmount: 0,
      },
    });
    await tx.creditTransaction.create({
      data: {
        userId: user.id,
        amount: creditsToAdd,
        type: 'add',
        reason: `Razorpay payment - Order ID: ${orderId}`,
        balanceBefore,
        balanceAfter,
      },
    });
    return { credited: true, newBalance: balanceAfter };
  });

  if (!creditResult.credited) {
    logger.log(`[${requestId}] Transaction already credited concurrently: ${orderId}`);
    return;
  }
  const newBalance = creditResult.newBalance;

  logger.log(`[${requestId}] ✅ Payment processed successfully via webhook`);
  logger.log(`[${requestId}] Credits: ₹${transaction.creditAmount} added. GST invoice will be generated when user provides billing details.`);

  // Zoho is the invoice of record, and it was only ever asked from verify-payment's
  // winning branch. When THIS path wins the crediting race — the user paid and closed
  // the tab, or the webhook simply landed first — the taxable supply was never
  // invoiced anywhere, and the customer's own invoice request answered 503 until an
  // admin ran the backfill by hand. Whoever credits, invoices. Best-effort exactly as
  // in verify-payment: a Zoho outage must not fail the webhook.
  try {
    const { createZohoInvoice } = await import('@/lib/zoho-books');
    const zohoResult = await createZohoInvoice({
      customerName: user.name || user.email,
      customerEmail: user.email,
      gstin: user.gstin,
      creditAmount: transaction.creditAmount,
      gstAmount: transaction.gstAmount,
      totalAmount: transaction.totalAmount,
      razorpayOrderId: orderId,
      razorpayPaymentId: paymentId,
    });
    await prisma.razorpayTransaction.update({
      where: { id: transaction.id },
      data: {
        notes: {
          ...((transaction.notes as any) || {}),
          zohoInvoiceNumber: zohoResult.invoiceNumber,
          zohoInvoiceId: zohoResult.invoiceId,
        },
      },
    }).catch((noteError: any) => {
      console.error(`[${requestId}] ⚠️ Could not record the Zoho invoice number:`, noteError?.message);
    });
    logger.log(`[${requestId}] ✅ Zoho Books invoice created: ${zohoResult.invoiceNumber}`);
  } catch (zohoError: any) {
    console.error(`[${requestId}] ⚠️ Zoho Books invoice creation failed (webhook path):`, zohoError?.message);
  }

  await processReferralReward(user.id, transaction.id, { email: payment.email, contact: payment.contact })
    .then((result) => {
      if (result.rewarded) {
        logger.log(`[${requestId}] Referral rewards credited successfully`);
      }
    })
    .catch((error) => {
      console.error(`[${requestId}] Referral reward processing failed:`, error);
    });

  await sendSlackAlert('info', 'Razorpay payment credited', {
    'Request ID': requestId,
    'User': user.email || user.name || user.id,
    'Order ID': orderId,
    'Payment ID': paymentId,
    'Credits Added': `₹${transaction.creditAmount.toLocaleString('en-IN')}`,
    'New Balance': `₹${newBalance.toLocaleString('en-IN')}`
  });

  // Send WhatsApp payment confirmation if user has phone number
  if (user.phone) {
    logger.log(`[${requestId}] Sending WhatsApp payment confirmation to ${user.phone}...`);
    try {
      // The credits bought -- what the confirmation message tells the customer.
      const actualCreditsAdded = transaction.creditAmount;
      
      const paymentTime = new Date();
      const whatsappResult = await sendPaymentConfirmation(
        user.phone,
        user.name || user.email,
        orderId,
        actualCreditsAdded,
        transaction.gstAmount,
        transaction.totalAmount,
        newBalance,
        paymentTime
      );
      
      if (whatsappResult.success) {
        logger.log(`[${requestId}] ✅ WhatsApp payment confirmation sent successfully (webhook)`);
      } else {
        console.error(`[${requestId}] ⚠️ WhatsApp payment confirmation failed (webhook):`, whatsappResult.error);
      }

      // Log the WhatsApp message to database
      try {
        const { format } = await import('date-fns');
        const istOffset = 5.5 * 60 * 60 * 1000;
        const istTime = new Date(paymentTime.getTime() + istOffset);
        
        const templateParams = [
          user.name || user.email,
          orderId,
          `Rs. ${actualCreditsAdded.toFixed(2)}`,
          `Rs. ${transaction.gstAmount.toFixed(2)}`,
          `Rs. ${transaction.totalAmount.toFixed(2)}`,
          `Rs. ${newBalance.toFixed(2)}`,
          format(istTime, 'dd-MMM-yyyy \'at\' hh:mm a'),
        ];

        await prisma.whatsAppLog.create({
          data: {
            billId: null, // No bill associated with payment confirmation
            userId: user.id,
            phoneNumber: user.phone,
            recipientName: user.name || user.email,
            template: 'payment_confirmation',
            parameters: templateParams,
            status: whatsappResult.success ? 'sent' : 'failed',
            messageId: whatsappResult.messageId || null,
            errorMessage: whatsappResult.success ? null : (whatsappResult.error || 'Unknown error'),
            pdfUrl: null, // No PDF for payment confirmation
            sentAt: new Date(),
          },
        });
        logger.log(`[${requestId}] ✅ WhatsApp payment log saved to database (webhook)`);
      } catch (logError: any) {
        console.error(`[${requestId}] ⚠️ Failed to log WhatsApp message to database (webhook):`, logError);
        // Don't fail the webhook if logging fails
      }
    } catch (whatsappError: any) {
      console.error(`[${requestId}] ⚠️ WhatsApp payment confirmation error (webhook):`, whatsappError);
      // Don't fail the webhook if WhatsApp fails
    }
  } else {
    logger.log(`[${requestId}] ⚠️ User has no phone number, skipping WhatsApp notification (webhook)`);
  }
}

async function handlePaymentFailure(requestId: string, payment: any) {
  logger.log(`[${requestId}] Processing failed payment`);

  const orderId = payment.order_id;

  // Find transaction
  const transaction = await prisma.razorpayTransaction.findUnique({
    where: { orderId },
  });

  if (!transaction) {
    console.error(`[${requestId}] Transaction not found: ${orderId}`);
    await sendSlackAlert('warning', 'Razorpay webhook: transaction not found', {
      'Request ID': requestId,
      'Order ID': orderId,
      'Payment ID': payment?.id || 'N/A'
    });
    return;
  }

  // Never let a failure notice overwrite a success. Razorpay retries webhooks for a
  // day and does not guarantee order: a failed first attempt's webhook can arrive
  // AFTER the successful retry has been credited. A plain update flipped the row back
  // to 'failed', which re-armed the "status not success" guard both crediting paths
  // rely on — so the next redelivery of payment.captured credited the same money twice.
  const marked = await prisma.razorpayTransaction.updateMany({
    where: { id: transaction.id, status: { not: 'success' } },
    data: {
      razorpayPaymentId: payment.id,
      status: 'failed',
      completedAt: new Date(),
    },
  });

  if (marked.count === 0) {
    logger.log(`[${requestId}] Ignoring failure notice for already-successful transaction ${transaction.id}`);
  } else {
    logger.log(`[${requestId}] Payment marked as failed`);
  }
}

