import { logger } from '@/lib/logger';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { createRazorpayOrder, getRazorpayKeyId } from '@/lib/razorpay';
import { prisma } from '@/lib/db';
import { calculateGst } from '@/lib/gst-invoice';

const MIN_TOPUP_AMOUNT = 1000;

/**
 * POST /api/razorpay/create-order
 * Creates a Razorpay order for credit purchase
 * 
 * Request Body:
 * - creditAmount: number (required, positive) - Amount of credits to purchase in INR
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

    const { creditAmount, totalAmount, gstAmount, gstOption = 'include' } = body;

    // Validate gstOption
    if (gstOption && !['include', 'exclude', 'without'].includes(gstOption)) {
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

    // Validate creditAmount
    if (creditAmount === undefined || creditAmount === null) {
      logger.warn(`[${requestId}] Missing creditAmount in request`);
      return NextResponse.json(
        { 
          error: 'Invalid request',
          message: 'creditAmount is required',
          code: 'MISSING_CREDIT_AMOUNT'
        },
        { status: 400 }
      );
    }

    if (typeof creditAmount !== 'number') {
      logger.warn(`[${requestId}] Invalid creditAmount type:`, typeof creditAmount);
      return NextResponse.json(
        { 
          error: 'Invalid request',
          message: 'creditAmount must be a number',
          code: 'INVALID_CREDIT_AMOUNT_TYPE'
        },
        { status: 400 }
      );
    }

    if (creditAmount <= 0) {
      logger.warn(`[${requestId}] Invalid creditAmount value:`, creditAmount);
      return NextResponse.json(
        { 
          error: 'Invalid request',
          message: 'creditAmount must be greater than 0',
          code: 'INVALID_CREDIT_AMOUNT_VALUE'
        },
        { status: 400 }
      );
    }

    if (creditAmount < MIN_TOPUP_AMOUNT) {
      logger.warn(`[${requestId}] creditAmount below minimum:`, creditAmount);
      return NextResponse.json(
        {
          error: 'Invalid request',
          message: `Minimum top-up amount is ₹${MIN_TOPUP_AMOUNT.toLocaleString('en-IN')}`,
          code: 'MINIMUM_TOPUP_AMOUNT'
        },
        { status: 400 }
      );
    }

    if (!Number.isFinite(creditAmount)) {
      logger.warn(`[${requestId}] Non-finite creditAmount:`, creditAmount);
      return NextResponse.json(
        { 
          error: 'Invalid request',
          message: 'creditAmount must be a finite number',
          code: 'INVALID_CREDIT_AMOUNT_FINITE'
        },
        { status: 400 }
      );
    }

    // Validate totalAmount
    if (totalAmount === undefined || totalAmount === null) {
      logger.warn(`[${requestId}] Missing totalAmount in request`);
      return NextResponse.json(
        { 
          error: 'Invalid request',
          message: 'totalAmount is required',
          code: 'MISSING_TOTAL_AMOUNT'
        },
        { status: 400 }
      );
    }

    if (typeof totalAmount !== 'number' || totalAmount <= 0 || !Number.isFinite(totalAmount)) {
      logger.warn(`[${requestId}] Invalid totalAmount:`, totalAmount);
      return NextResponse.json(
        { 
          error: 'Invalid request',
          message: 'totalAmount must be a positive finite number',
          code: 'INVALID_TOTAL_AMOUNT'
        },
        { status: 400 }
      );
    }

    // Validate gstAmount
    if (gstAmount === undefined || gstAmount === null || typeof gstAmount !== 'number' || !Number.isFinite(gstAmount)) {
      logger.warn(`[${requestId}] Invalid gstAmount:`, gstAmount);
      return NextResponse.json(
        { 
          error: 'Invalid request',
          message: 'gstAmount must be a finite number',
          code: 'INVALID_GST_AMOUNT'
        },
        { status: 400 }
      );
    }

    logger.log(`[${requestId}] Amounts validated - Credit: ₹${creditAmount}, Total: ₹${totalAmount}, GST: ₹${gstAmount}, Option: ${gstOption}`);

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

    // Step 5: Calculate GST breakdown for invoice (CGST + SGST)
    let gstCalc;
    if (gstAmount > 0) {
      gstCalc = calculateGst(creditAmount, false);
      logger.log(`[${requestId}] GST breakdown calculated:`, {
        creditAmount,
        totalGst: gstAmount,
        cgst: gstCalc.cgst,
        sgst: gstCalc.sgst,
      });
    } else {
      // No GST
      gstCalc = {
        baseAmount: creditAmount,
        cgst: 0,
        sgst: 0,
        igst: 0,
        totalGst: 0,
        totalAmount: creditAmount,
      };
    }

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
        amount: totalAmount,
        currency: 'INR',
        receipt,
        payment_capture: 1, // Auto-capture payment
        notes: {
          userId: user.id,
          userEmail: user.email,
          creditAmount: creditAmount.toString(),
          gstAmount: gstAmount.toString(),
          gstOption: gstOption,
          requestId,
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
          amount: totalAmount,
          currency: 'INR',
          status: 'created',
          receipt,
          creditAmount,
          gstAmount: gstAmount,
          totalAmount: totalAmount,
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
        amount: totalAmount,
        error: dbError.message,
      });

      return NextResponse.json(
        { 
          error: 'Partial failure',
          message: 'Order created but not saved. Please contact support with order ID.',
          code: 'DB_SAVE_FAILED',
          orderId: razorpayOrder.id,
          amount: totalAmount,
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
      amount: totalAmount,
      currency: 'INR',
      keyId,
      transactionId: transaction.id,
      creditAmount,
      gstAmount: gstAmount,
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

