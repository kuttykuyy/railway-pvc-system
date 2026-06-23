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
      const gstOption = transactionNotes?.gstOption || 'exclude';
      const actualCreditsAdded = gstOption === 'include' ? transaction.totalAmount : transaction.creditAmount;
      
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
      console.error(`[${requestId}] User not found: ${session.user.email}`);
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
    logger.log(`[${requestId}] Payment method: ${paymentDetails.method}`);

    // Update transaction status
    logger.log(`[${requestId}] Updating transaction status to success...`);
    await prisma.razorpayTransaction.update({
      where: { id: transaction.id },
      data: {
        razorpayPaymentId: razorpay_payment_id,
        razorpaySignature: razorpay_signature,
        status: 'success',
        paymentMethod: paymentDetails.method,
        completedAt: new Date(),
      },
    });
    logger.log(`[${requestId}] Transaction status updated`);

    // Determine how much to add to wallet based on GST option
    // Get gstOption from transaction notes
    const transactionNotes = transaction.notes as any;
    const gstOption = transactionNotes?.gstOption || 'exclude';
    
    let creditsToAdd = transaction.creditAmount;
    
    // If "Include GST" option was selected, add the full totalAmount to wallet (including GST)
    if (gstOption === 'include') {
      creditsToAdd = transaction.totalAmount; // Add full amount including GST
      logger.log(`[${requestId}] GST Option: Include - Adding full payment amount to wallet (₹${creditsToAdd})`);
    } else {
      logger.log(`[${requestId}] GST Option: ${gstOption} - Adding creditAmount to wallet (₹${creditsToAdd})`);
    }

    // Get current balance
    const currentBalance = user.customerAccount?.creditBalance || 0;
    const newBalance = currentBalance + creditsToAdd;

    logger.log(`[${requestId}] Credit update:`, {
      currentBalance,
      addingCredits: creditsToAdd,
      gstOption,
      newBalance
    });

    // Update or create customer account
    if (user.customerAccount) {
      logger.log(`[${requestId}] Updating existing customer account...`);
      await prisma.customerAccount.update({
        where: { userId: user.id },
        data: {
          creditBalance: newBalance,
        },
      });
    } else {
      logger.log(`[${requestId}] Creating new customer account...`);
      await prisma.customerAccount.create({
        data: {
          userId: user.id,
          creditBalance: creditsToAdd,
          currentMonthBills: 0,
          outstandingAmount: 0,
        },
      });
    }
    logger.log(`[${requestId}] Customer account updated`);

    // Create credit transaction record
    logger.log(`[${requestId}] Creating credit transaction record...`);
    await prisma.creditTransaction.create({
      data: {
        userId: user.id,
        amount: creditsToAdd,
        type: 'add',
        reason: `Razorpay payment - Order ID: ${razorpay_order_id}${gstOption === 'include' ? ' (includes GST)' : ''}`,
        balanceBefore: currentBalance,
        balanceAfter: newBalance,
      },
    });
    logger.log(`[${requestId}] Credit transaction record created`);

    await processReferralReward(user.id, transaction.id)
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
