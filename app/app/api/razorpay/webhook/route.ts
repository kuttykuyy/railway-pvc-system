import { logger } from '@/lib/logger';

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/lib/db';
import { sendPaymentConfirmation } from '@/lib/whatsapp-mydreams';
import { sendSlackAlert } from '@/lib/slack-webhook';
import { processReferralReward } from '@/lib/referrals';

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

    if (signature !== expectedSignature) {
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

    // Handle payment events
    if (eventType === 'payment.authorized' || eventType === 'payment.captured') {
      await handlePaymentSuccess(requestId, payment);
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

  // Check if already processed
  if (transaction.status === 'success') {
    logger.log(`[${requestId}] Transaction already processed: ${orderId}`);
    return;
  }

  logger.log(`[${requestId}] Processing transaction: ${transaction.id}`);

  // Update transaction
  await prisma.razorpayTransaction.update({
    where: { id: transaction.id },
    data: {
      razorpayPaymentId: paymentId,
      status: 'success',
      paymentMethod: payment.method,
      completedAt: new Date(),
    },
  });

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

  const currentBalance = user.customerAccount?.creditBalance || 0;
  const newBalance = currentBalance + transaction.creditAmount;

  logger.log(`[${requestId}] Adding credits:`, {
    userId: user.id,
    currentBalance,
    addingCredits: transaction.creditAmount,
    newBalance,
  });

  // Update or create customer account
  await prisma.customerAccount.upsert({
    where: { userId: user.id },
    update: {
      creditBalance: newBalance,
    },
    create: {
      userId: user.id,
      creditBalance: transaction.creditAmount,
      currentMonthBills: 0,
      outstandingAmount: 0,
    },
  });

  // Create credit transaction record
  await prisma.creditTransaction.create({
    data: {
      userId: user.id,
      amount: transaction.creditAmount,
      type: 'add',
      reason: `Razorpay payment - Order ID: ${orderId}`,
      balanceBefore: currentBalance,
      balanceAfter: newBalance,
    },
  });

  logger.log(`[${requestId}] ✅ Payment processed successfully via webhook`);
  logger.log(`[${requestId}] Credits: ₹${transaction.creditAmount} added. GST invoice will be generated when user provides billing details.`);

  await processReferralReward(user.id, transaction.id)
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
      // Determine actual credits added based on GST option
      const transactionNotes = transaction.notes as any;
      const gstOption = transactionNotes?.gstOption || 'exclude';
      const actualCreditsAdded = gstOption === 'include' ? transaction.totalAmount : transaction.creditAmount;
      
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

  // Update transaction status
  await prisma.razorpayTransaction.update({
    where: { id: transaction.id },
    data: {
      razorpayPaymentId: payment.id,
      status: 'failed',
      completedAt: new Date(),
    },
  });

  logger.log(`[${requestId}] Payment marked as failed`);
}

