import { logger } from '@/lib/logger';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { createRazorpayOrder, getRazorpayKeyId } from '@/lib/razorpay';
import { prisma } from '@/lib/db';
import { calculateGst } from '@/lib/gst-invoice';
import { resolvePurchase } from '@/lib/bill-packs';

/**
 * POST /api/razorpay/create-order
 * Creates a Razorpay order for credit purchase
 *
 * Request Body:
 * - purpose: 'topup' (default) | 'pack' | 'single_bill'
 * - creditAmount: number - rupees of credit to buy (topup: >= ₹1,000; single_bill: exactly one bill's cost)
 * - packBills: number - which pack, by its bill count (purpose 'pack' only)
 *
 * Response:
 * - Success (200): { orderId, amount, currency, keyId, transactionId, creditAmount, gstAmount, cgst, sgst }
 * - Errors: Appropriate HTTP status codes with error details
 */
export async function POST(request: NextRequest) {
  const requestId = `REQ_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  logger.log(`[${requestId}] Razorpay order creation request initiated`);
  
  try {
    // Step 1: Authenticate user
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      logger.warn(`[${requestId}] Unauthorized access attempt`);
      return NextResponse.json(
        { 
          error: 'Unauthorized',
          message: 'You must be logged in to create an order',
          code: 'UNAUTHORIZED'
        },
        { status: 401 }
      );
    }

    logger.log(`[${requestId}] User authenticated: ${session.user.email}`);

    // Step 2: Parse and validate request body
    let body;
    try {
      body = await request.json();
    } catch (parseError) {
      console.error(`[${requestId}] Invalid JSON in request body:`, parseError);
      return NextResponse.json(
        { 
          error: 'Invalid request',
          message: 'Request body must be valid JSON',
          code: 'INVALID_JSON'
        },
        { status: 400 }
      );
    }

    // The default describes how the charge below is actually worked out: GST is added
    // ON TOP of the credit amount (serverGst, further down), so the basis is exclusive.
    // It defaulted to 'include', which said the opposite, and the dialog never sends a
    // value -- so every payment recorded the wrong basis. That was read in two places
    // and got both wrong: the wallet was credited the gross rather than the credits
    // bought, and the invoice was written up as tax-inside, recording a Rs 1,000 supply
    // with Rs 152.54 of tax when Rs 1,180 had been collected.
    const { totalAmount, gstAmount, gstOption = 'exclude', purpose, packBills, packAi } = body;

    // Validate gstOption. 'without' is deliberately NOT accepted: it set the tax to
    // zero on a taxable supply, and the value arrives in the request body, so any
    // caller could post it and pay 18% less while still receiving the credits. The
    // supplier would still owe that tax. The dialog never sent it.
    if (gstOption && !['include', 'exclude'].includes(gstOption)) {
      logger.warn(`[${requestId}] Invalid gstOption:`, gstOption);
      return NextResponse.json(
        { 
          error: 'Invalid request',
          message: 'gstOption must be one of: include, exclude, without',
          code: 'INVALID_GST_OPTION'
        },
        { status: 400 }
      );
    }

    // 🔒 SECURITY: never trust the client's amounts. The customer only chooses WHAT to
    // buy — a plain top-up amount, a named pack, or one bill — and the price, the
    // credits granted and the GST are all worked out here from the admin settings, so
    // a caller cannot pay ₹1 for a huge credit grant. resolvePurchase also enforces the
    // ₹1,000 top-up minimum and the exact-cost rule for the single-bill shortcut.
    const fee = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { customProcessingFee: true },
    }).catch(() => null);
    const resolved = await resolvePurchase({
      purpose, packBills, packAi, creditAmount: body.creditAmount,
      customBillCost: fee?.customProcessingFee ?? null,
    });
    if (resolved.ok === false) {
      logger.warn(`[${requestId}] Purchase rejected: ${resolved.code}`, { purpose, packBills, creditAmount: body.creditAmount });
      return NextResponse.json(
        { error: 'Invalid request', message: resolved.error, code: resolved.code },
        { status: 400 }
      );
    }
    const { purchase } = resolved;
    // creditAmount is the rupees paid before tax — the invoice's taxable value. A pack
    // grants more credits than that; the grant travels in the order notes.
    const creditAmount = purchase.price;

    logger.log(`[${requestId}] ${purchase.label}: ₹${creditAmount} → ${purchase.credits} credits (client said total ₹${totalAmount}, GST ₹${gstAmount}), Option: ${gstOption}`);

    const serverGst = calculateGst(creditAmount, false);
    // Tax is not optional on a taxable supply — it is always charged and always
    // remitted, whatever the request asked for.
    const serverGstAmount = serverGst.totalGst;
    const serverTotalAmount = serverGst.totalAmount;
    if (typeof totalAmount === 'number' && Math.abs(totalAmount - serverTotalAmount) > 1) {
      logger.warn(`[${requestId}] Client totalAmount ₹${totalAmount} != server ₹${serverTotalAmount}; charging server value.`);
    }

    // Step 3: Check if Razorpay is enabled
    let setting;
    try {
      setting = await prisma.adminSettings.findUnique({
        where: { key: 'payment_method' },
      });
    } catch (dbError: any) {
      console.error(`[${requestId}] Database error fetching payment settings:`, dbError);
      return NextResponse.json(
        { 
          error: 'Service unavailable',
          message: 'Unable to check payment settings. Please try again later.',
          code: 'DATABASE_ERROR'
        },
        { status: 503 }
      );
    }

    if (setting?.value !== 'razorpay') {
      logger.warn(`[${requestId}] Razorpay not enabled. Current setting:`, setting?.value);
      return NextResponse.json(
        { 
          error: 'Payment method unavailable',
          message: 'Razorpay payments are currently not enabled. Please contact support.',
          code: 'RAZORPAY_DISABLED'
        },
        { status: 403 }
      );
    }

    logger.log(`[${requestId}] Razorpay is enabled`);

    // Step 4: Get user details
    let user;
    try {
      user = await prisma.user.findUnique({
        where: { email: session.user.email },
      });
    } catch (dbError: any) {
      console.error(`[${requestId}] Database error fetching user:`, dbError);
      return NextResponse.json(
        { 
          error: 'Service unavailable',
          message: 'Unable to fetch user details. Please try again later.',
          code: 'DATABASE_ERROR'
        },
        { status: 503 }
      );
    }

    if (!user) {
      console.error(`[${requestId}] User not found:`, session.user.email);
      return NextResponse.json(
        { 
          error: 'User not found',
          message: 'Your account could not be found. Please contact support.',
          code: 'USER_NOT_FOUND'
        },
        { status: 404 }
      );
    }

    logger.log(`[${requestId}] User found: ${user.id}`);

    // Step 5: GST breakdown for the invoice (CGST + SGST) — the server's figures.
    const gstCalc = serverGst;

    // Step 6: Validate Razorpay credentials
    const keyId = getRazorpayKeyId();
    if (!keyId) {
      console.error(`[${requestId}] Razorpay credentials not configured`);
      return NextResponse.json(
        { 
          error: 'Configuration error',
          message: 'Payment gateway is not properly configured. Please contact support.',
          code: 'RAZORPAY_NOT_CONFIGURED'
        },
        { status: 503 }
      );
    }

    // Step 7: Create Razorpay order
    // Generate compact receipt (max 40 chars for Razorpay)
    // Format: CR_<base36_timestamp>_<user_id_prefix>
    const timestamp = Date.now().toString(36).toUpperCase(); // Base36 encoding (shorter)
    const userIdPrefix = user.id.replace(/-/g, '').slice(0, 8); // Remove hyphens, take first 8 chars
    const receipt = `CR_${timestamp}_${userIdPrefix}`;
    
    // Validate receipt length (Razorpay max: 40 characters)
    if (receipt.length > 40) {
      console.error(`[${requestId}] Receipt too long:`, { receipt, length: receipt.length });
      // Fallback: use shorter format
      const shortReceipt = `CR_${timestamp}_${user.id.slice(0, 4)}`;
      if (shortReceipt.length > 40) {
        return NextResponse.json(
          { 
            error: 'Configuration error',
            message: 'Unable to generate valid receipt ID. Please contact support.',
            code: 'RECEIPT_GENERATION_ERROR'
          },
          { status: 500 }
        );
      }
      logger.log(`[${requestId}] Using fallback receipt: ${shortReceipt}`);
    }
    
    logger.log(`[${requestId}] Generated receipt: ${receipt} (length: ${receipt.length})`);
    
    let razorpayOrder;
    
    try {
      razorpayOrder = await createRazorpayOrder({
        amount: serverTotalAmount,
        currency: 'INR',
        receipt,
        payment_capture: 1, // Auto-capture payment
        notes: {
          userId: user.id,
          userEmail: user.email,
          creditAmount: creditAmount.toString(),
          gstAmount: serverGstAmount.toString(),
          gstOption: gstOption,
          requestId,
          purpose: purchase.purpose,
          // Read back by creditsGrantedFor at verification. Razorpay note values are
          // strings, and the DB copy is this same object.
          ...(purchase.credits !== creditAmount ? { creditsGranted: purchase.credits.toString() } : {}),
          ...(purchase.packBills ? { packBills: purchase.packBills.toString(), packAi: String(purchase.packAi) } : {}),
        },
      });

      logger.log(`[${requestId}] Razorpay order created: ${razorpayOrder.id}`);
    } catch (razorpayError: any) {
      console.error(`[${requestId}] Razorpay order creation failed:`, {
        error: razorpayError.message,
        statusCode: razorpayError.statusCode,
        code: razorpayError.code,
      });

      // Return appropriate status code based on error
      const statusCode = razorpayError.statusCode || 500;
      const errorCode = razorpayError.code || 'RAZORPAY_ERROR';
      
      return NextResponse.json(
        { 
          error: 'Payment gateway error',
          message: razorpayError.message || 'Failed to create payment order. Please try again.',
          code: errorCode,
          details: razorpayError.razorpayError || undefined,
        },
        { status: statusCode }
      );
    }

    // Step 8: Save transaction to database
    let transaction;
    try {
      transaction = await prisma.razorpayTransaction.create({
        data: {
          userId: user.id,
          orderId: razorpayOrder.id,
          razorpayOrderId: razorpayOrder.id,
          amount: serverTotalAmount,
          currency: 'INR',
          status: 'created',
          receipt,
          creditAmount,
          gstAmount: serverGstAmount,
          totalAmount: serverTotalAmount,
          notes: razorpayOrder.notes as any,
        },
      });

      logger.log(`[${requestId}] Transaction saved to database: ${transaction.id}`);
    } catch (dbError: any) {
      console.error(`[${requestId}] Database error saving transaction:`, dbError);
      
      // Order was created in Razorpay but failed to save in DB
      // Log this critical error but still return order details to user
      console.error(`[${requestId}] CRITICAL: Razorpay order created but DB save failed`, {
        razorpayOrderId: razorpayOrder.id,
        userId: user.id,
        amount: serverTotalAmount,
        error: dbError.message,
      });

      return NextResponse.json(
        { 
          error: 'Partial failure',
          message: 'Order created but not saved. Please contact support with order ID.',
          code: 'DB_SAVE_FAILED',
          orderId: razorpayOrder.id,
          amount: serverTotalAmount,
          currency: 'INR',
          keyId,
        },
        { status: 207 } // Multi-Status
      );
    }

    // Step 9: Return success response
    logger.log(`[${requestId}] Order creation completed successfully`);
    
    return NextResponse.json({
      success: true,
      orderId: razorpayOrder.id,
      // The server's figures, not the client's echo: the checkout charges `amount`.
      amount: serverTotalAmount,
      currency: 'INR',
      keyId,
      transactionId: transaction.id,
      creditAmount,
      creditsGranted: purchase.credits,
      label: purchase.label,
      gstAmount: serverGstAmount,
      cgst: gstCalc.cgst,
      sgst: gstCalc.sgst,
      requestId,
    }, { status: 200 });

  } catch (error: any) {
    // Catch-all for unexpected errors
    console.error(`[${requestId}] Unexpected error in order creation:`, {
      error: error.message,
      stack: error.stack,
      name: error.name,
    });

    return NextResponse.json(
      { 
        error: 'Internal server error',
        message: 'An unexpected error occurred. Please try again later.',
        code: 'INTERNAL_ERROR',
        requestId,
      },
      { status: 500 }
    );
  }
}

