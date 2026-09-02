import { logger } from '@/lib/logger';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { verifyRazorpaySignature, fetchPaymentDetails } from '@/lib/razorpay';
import { prisma } from '@/lib/db';
import { sendPaymentConfirmation } from '@/lib/whatsapp-mydreams';
import { createZohoInvoice } from '@/lib/zoho-books';
import { processReferralReward } from '@/lib/referrals';

export async function POST(request: NextRequest) {
  const requestId = Date.now().toString(36);
  logger.log(`[${requestId}] Payment verification request started`);
  
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      console.error(`[${requestId}] Unauthorized: No session`);
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    logger.log(`[${requestId}] User: ${session.user.email}`);

    const body = await request.json();
    const { 
      razorpay_order_id, 
      razorpay_payment_id, 
      razorpay_signature,
      transactionId 
    } = body;

    logger.log(`[${requestId}] Payment details:`, {
      order_id: razorpay_order_id,
      payment_id: razorpay_payment_id,
      signature: razorpay_signature ? 'Present' : 'Missing'
    });

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      console.error(`[${requestId}] Missing payment parameters`);
      return NextResponse.json(
        { error: 'Missing payment parameters' },
        { status: 400 }
      );
    }

    // Verify signature
    logger.log(`[${requestId}] Verifying signature...`);
    const isValid = verifyRazorpaySignature({
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
      razorpaySignature: razorpay_signature,
    });

    if (!isValid) {
      console.error(`[${requestId}] Invalid payment signature`);
      return NextResponse.json(
        { error: 'Invalid payment signature' },
        { status: 400 }
      );
    }

    logger.log(`[${requestId}] Signature verified successfully`);

    // Get transaction from database
    logger.log(`[${requestId}] Looking up transaction: ${razorpay_order_id}`);
    const transaction = await prisma.razorpayTransaction.findUnique({
      where: { orderId: razorpay_order_id },
    });

    if (!transaction) {
      console.error(`[${requestId}] Transaction not found: ${razorpay_order_id}`);
      return NextResponse.json(
        { error: 'Transaction not found' },
        { status: 404 }
      );
    }

    logger.log(`[${requestId}] Transaction found:`, {
      id: transaction.id,
      userId: transaction.userId,
      status: transaction.status,
      creditAmount: transaction.creditAmount
    });

    // Check if already processed (by webhook or previous verification)
    if (transaction.status === 'success') {
      logger.log(`[${requestId}] Transaction already processed (likely by webhook)`);

      await processReferralReward(transaction.userId, transaction.id).catch((error) => {
        console.error(`[${requestId}] Referral reward reconciliation failed:`, error);
      });
      
      // Determine actual credits added based on GST option
      const transactionNotes = transaction.notes as any;
      // Same rule as the crediting path below: report the credits bought.
      const actualCreditsAdded = transaction.creditAmount;
      
      // Get GST invoice
      const gstInvoice = await prisma.gstInvoice.findFirst({
        where: { razorpayTransactionId: transaction.id },
      });

      return NextResponse.json({
        success: true,
        message: 'Payment already verified',
        creditAmount: actualCreditsAdded,
        gstAmount: transaction.gstAmount,
        totalAmount: transaction.totalAmount,
        newBalance: 0, // Don't return balance as it may have changed
        invoiceNumber: gstInvoice?.invoiceNumber || 'N/A',
        invoiceId: gstInvoice?.id || null,
        alreadyProcessed: true,
      });
    }

    // Get user first to verify ownership
    logger.log(`[${requestId}] Looking up user account...`);
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { customerAccount: true },
      // gstin is on the base user model
    });

    if (!user) {
      // Avoid writing the raw email to persistent logs; the requestId is enough to correlate.
      console.error(`[${requestId}] User not found for authenticated session`);
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Verify user owns this transaction (compare user IDs, not email)
    if (transaction.userId !== user.id) {
      console.error(`[${requestId}] Unauthorized: User mismatch`, {
        transactionUserId: transaction.userId,
        sessionUserId: user.id,
        sessionUserEmail: session.user.email
      });
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      );
    }

    logger.log(`[${requestId}] User ownership verified`);

    // Fetch payment details from Razorpay
    logger.log(`[${requestId}] Fetching payment details from Razorpay...`);
    const paymentDetails = await fetchPaymentDetails(razorpay_payment_id);
    logger.log(`[${requestId}] Payment method: ${paymentDetails.method}, status: ${(paymentDetails as any).status}`);

    // Only captured money is money. An authorized payment whose auto-capture fails is
    // auto-refunded by Razorpay; crediting it hands out credits for money that goes
    // back. With auto-capture on, capture follows within moments — the webhook credits
    // it then, so a genuine payment is never lost by refusing here.
    if ((paymentDetails as any).status && (paymentDetails as any).status !== 'captured') {
      logger.log(`[${requestId}] Payment ${razorpay_payment_id} not captured yet (${(paymentDetails as any).status}); not crediting.`);
      return NextResponse.json(
        { error: 'Payment is not captured yet. If money was deducted, credits will arrive automatically within a few minutes.' },
        { status: 409 }
      );
    }

    // The signature proves this payment belongs to this order id; it says nothing about
    // how much was paid. Razorpay's own record of the payment must name this order and
    // carry the amount the order was created for, so a payment for another order, or a
    // smaller one, cannot redeem these credits.
    const expectedPaise = Math.round(Number(transaction.amount) * 100);
    const paidPaise = Number((paymentDetails as any).amount);
    const paidOrderId = (paymentDetails as any).order_id;
    const paidCurrency = (paymentDetails as any).currency;
    if (
      paidOrderId !== razorpay_order_id
      || !Number.isFinite(paidPaise) || Math.abs(paidPaise - expectedPaise) > 1
      || (paidCurrency && paidCurrency !== (transaction.currency || 'INR'))
    ) {
      console.error(`[${requestId}] Payment does not match order: order ${paidOrderId} vs ${razorpay_order_id}, amount ${paidPaise} vs ${expectedPaise} paise, currency ${paidCurrency}`);
      return NextResponse.json(
        { error: 'Payment does not match this order' },
        { status: 400 }
      );
    }

    // Determine how much to add to wallet based on GST option
    const transactionNotes = transaction.notes as any;
    const gstOption = transactionNotes?.gstOption || 'exclude';
    // Always the credits bought, never the gross paid. This held gstOption === 'include'
    // ? totalAmount : creditAmount, and nothing ever sent a gstOption, so it took the
    // stored default and granted the gross -- Rs 1,180 of credit on a Rs 1,000 top-up
    // the dialog had promised Rs 1,000 for, with the Rs 180 difference being tax owed
    // to the government. creditAmount is right under either basis: with tax on top it
    // is what was bought, and with tax inside it is both what was paid and what was
    // bought. Orders created before this still carry the old note, so read neither.
    const creditsToAdd = transaction.creditAmount;

    // Flip the transaction to 'success' and credit the wallet in a single atomic
    // transaction. The conditional update (status not already 'success') guarantees the
    // credit is applied exactly once even if the Razorpay webhook processes the same
    // order concurrently.
    const creditResult = await prisma.$transaction(async (tx) => {
      const flip = await tx.razorpayTransaction.updateMany({
        where: { id: transaction.id, status: { not: 'success' } },
        data: {
          razorpayPaymentId: razorpay_payment_id,
          razorpaySignature: razorpay_signature,
          status: 'success',
          paymentMethod: paymentDetails.method,
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
          reason: `Razorpay payment - Order ID: ${razorpay_order_id}`,
          balanceBefore,
          balanceAfter,
        },
      });
      return { credited: true, newBalance: balanceAfter };
    });

    // If the webhook (or another verify call) already credited this order, acknowledge
    // without running the referral/WhatsApp/Zoho side effects a second time.
    if (!creditResult.credited) {
      logger.log(`[${requestId}] Order already credited concurrently; skipping duplicate credit`);
      const gstInvoice = await prisma.gstInvoice.findFirst({
        where: { razorpayTransactionId: transaction.id },
      });
      return NextResponse.json({
        success: true,
        message: 'Payment already verified',
        creditAmount: creditsToAdd,
        gstAmount: transaction.gstAmount,
        totalAmount: transaction.totalAmount,
        newBalance: 0,
        invoiceNumber: gstInvoice?.invoiceNumber || 'N/A',
        invoiceId: gstInvoice?.id || null,
        alreadyProcessed: true,
      });
    }

    const newBalance = creditResult.newBalance;
    logger.log(`[${requestId}] Credited ₹${creditsToAdd} (gstOption: ${gstOption}); new balance ₹${newBalance}`);

    await processReferralReward(user.id, transaction.id, {
      email: (paymentDetails as any).email,
      contact: (paymentDetails as any).contact,
    })
      .then((result) => {
        if (result.rewarded) {
          logger.log(`[${requestId}] Referral rewards credited successfully`);
        }
      })
      .catch((error) => {
        console.error(`[${requestId}] Referral reward processing failed:`, error);
      });

    // Generate temporary invoice number (will be finalized when user provides billing details)
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');
    const tempInvoiceNumber = `GST-${dateStr}-PENDING`;

    logger.log(`[${requestId}] ✅ Payment verification completed successfully`);
    logger.log(`[${requestId}] Temporary Invoice: ${tempInvoiceNumber}, Credits Added: ₹${creditsToAdd}, New Balance: ₹${newBalance}`);

    // Send WhatsApp payment confirmation if user has phone number
    if (user.phone) {
      logger.log(`[${requestId}] Sending WhatsApp payment confirmation to ${user.phone}...`);
      try {
        // Use the actual payment completion time
        const paymentTime = new Date(); // This is the time when payment was completed
        
        const whatsappResult = await sendPaymentConfirmation(
          user.phone,
          user.name || user.email,
          razorpay_order_id,
          creditsToAdd,
          transaction.gstAmount,
          transaction.totalAmount,
          newBalance,
          paymentTime
        );
        
        if (whatsappResult.success) {
          logger.log(`[${requestId}] ✅ WhatsApp payment confirmation sent successfully`);
        } else {
          console.error(`[${requestId}] ⚠️ WhatsApp payment confirmation failed:`, whatsappResult.error);
        }

        // Log the WhatsApp message to database
        try {
          const { format } = await import('date-fns');
          const istOffset = 5.5 * 60 * 60 * 1000;
          const istTime = new Date(paymentTime.getTime() + istOffset);
          
          const templateParams = [
            user.name || user.email,
            razorpay_order_id,
            `Rs. ${creditsToAdd.toFixed(2)}`,
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
          logger.log(`[${requestId}] ✅ WhatsApp payment log saved to database`);
        } catch (logError: any) {
          console.error(`[${requestId}] ⚠️ Failed to log WhatsApp message to database:`, logError);
          // Don't fail the payment verification if logging fails
        }
      } catch (whatsappError: any) {
        console.error(`[${requestId}] ⚠️ WhatsApp payment confirmation error:`, whatsappError);
        // Don't fail the payment verification if WhatsApp fails
      }
    } else {
      logger.log(`[${requestId}] ⚠️ User has no phone number, skipping WhatsApp notification`);
    }

    // Create Zoho Books sales invoice
    let zohoInvoiceNumber = tempInvoiceNumber;
    let zohoInvoiceId = null;
    try {
      const zohoResult = await createZohoInvoice({
        customerName: user.name || user.email,
        customerEmail: user.email,
        gstin: user.gstin,
        creditAmount: transaction.creditAmount,
        gstAmount: transaction.gstAmount,
        totalAmount: transaction.totalAmount,
        razorpayOrderId: razorpay_order_id,
        razorpayPaymentId: razorpay_payment_id,
      });
      zohoInvoiceNumber = zohoResult.invoiceNumber;
      zohoInvoiceId = zohoResult.invoiceId;
      logger.log(`[${requestId}] ✅ Zoho Books invoice created: ${zohoInvoiceNumber}`);
      // Keep the number of record with the payment. Zoho is the invoice of record and
      // the app's copy must carry its number; without this, issuing that copy later
      // depends on Zoho being reachable at that moment. Stored in the existing notes
      // JSON, so no column is added.
      try {
        await prisma.razorpayTransaction.update({
          where: { id: transaction.id },
          data: {
            notes: {
              ...((transaction.notes as any) || {}),
              zohoInvoiceNumber: zohoResult.invoiceNumber,
              zohoInvoiceId: zohoResult.invoiceId,
            },
          },
        });
      } catch (noteError: any) {
        console.error(`[${requestId}] ⚠️ Could not record the Zoho invoice number:`, noteError?.message);
      }
    } catch (zohoError: any) {
      console.error(`[${requestId}] ⚠️ Zoho Books invoice creation failed:`, zohoError.message);
      // Don't fail payment if Zoho fails
    }

    return NextResponse.json({
      success: true,
      message: 'Payment verified successfully',
      creditAmount: creditsToAdd,
      gstAmount: transaction.gstAmount,
      totalAmount: transaction.totalAmount,
      newBalance,
      transactionId: transaction.id,
      invoiceNumber: zohoInvoiceNumber,
      zohoInvoiceId,
    });
  } catch (error: any) {
    console.error(`[${requestId}] ❌ Error verifying payment:`, error);
    console.error(`[${requestId}] Error stack:`, error.stack);
    return NextResponse.json(
      { error: error.message || 'Failed to verify payment' },
      { status: 500 }
    );
  }
}
