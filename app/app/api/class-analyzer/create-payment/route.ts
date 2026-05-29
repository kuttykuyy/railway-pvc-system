
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import crypto from 'crypto';

// POST /api/pvc-comparison/create-payment
export async function POST(request: Request) {
  const startTime = Date.now();
  let errorDetails = '';
  
  try {
    // Log request initiation
    console.log('[PVC Payment] Payment creation initiated');
    
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      console.error('[PVC Payment] Unauthorized access attempt');
      return NextResponse.json(
        { error: 'Unauthorized', code: 'AUTH_REQUIRED' },
        { status: 401 }
      );
    }

    const userId = (session.user as any).id as string;
    console.log('[PVC Payment] User ID:', userId);
    
    const { sessionToken } = await request.json();

    if (!sessionToken) {
      console.error('[PVC Payment] Missing session token');
      return NextResponse.json(
        { error: 'Session token is required', code: 'MISSING_SESSION_TOKEN' },
        { status: 400 }
      );
    }

    console.log('[PVC Payment] Checking session:', sessionToken);

    // Check if session exists and is unpaid
    const pvcSession = await prisma.pvcComparisonSession.findUnique({
      where: { sessionToken },
    });

    if (!pvcSession || pvcSession.userId !== userId) {
      console.error('[PVC Payment] Invalid session or user mismatch');
      return NextResponse.json(
        { error: 'Invalid session', code: 'INVALID_SESSION' },
        { status: 404 }
      );
    }

    if (pvcSession.paymentStatus === 'paid') {
      console.log('[PVC Payment] Session already paid');
      return NextResponse.json(
        { error: 'Session already paid', code: 'ALREADY_PAID' },
        { status: 400 }
      );
    }

    console.log('[PVC Payment] Checking Razorpay configuration...');

    // Check if Razorpay is enabled
    const razorpaySetting = await prisma.adminSettings.findUnique({
      where: { key: 'razorpay_enabled' },
    });

    const razorpayEnabled = razorpaySetting?.value === 'true';
    console.log('[PVC Payment] Razorpay enabled:', razorpayEnabled);

    if (!razorpayEnabled) {
      console.error('[PVC Payment] Razorpay is disabled in admin settings');
      return NextResponse.json(
        { 
          error: 'Payment system is currently disabled. Please contact support.',
          code: 'PAYMENT_DISABLED',
          details: 'Razorpay is not enabled in admin settings'
        },
        { status: 503 }
      );
    }

    // Get Razorpay credentials
    const keyIdSetting = await prisma.adminSettings.findUnique({
      where: { key: 'razorpay_key_id' },
    });
    const keySecretSetting = await prisma.adminSettings.findUnique({
      where: { key: 'razorpay_key_secret' },
    });

    if (!keyIdSetting?.value || !keySecretSetting?.value) {
      console.error('[PVC Payment] Razorpay credentials not configured');
      console.error('[PVC Payment] Key ID present:', !!keyIdSetting?.value);
      console.error('[PVC Payment] Key Secret present:', !!keySecretSetting?.value);
      
      return NextResponse.json(
        { 
          error: 'Payment system is not properly configured. Please contact support.',
          code: 'PAYMENT_NOT_CONFIGURED',
          details: 'Razorpay credentials are missing'
        },
        { status: 503 }
      );
    }

    console.log('[PVC Payment] Creating Razorpay order...');

    // Create Razorpay order
    const Razorpay = (await import('razorpay')).default;
    const razorpay = new Razorpay({
      key_id: keyIdSetting.value,
      key_secret: keySecretSetting.value,
    });

    const amount = 250 * 100; // Convert to paise
    const receipt = `pvc_${sessionToken}_${Date.now()}`;

    let order;
    try {
      order = await razorpay.orders.create({
        amount,
        currency: 'INR',
        receipt,
        notes: {
          type: 'pvc_comparison',
          sessionToken,
          userId,
        },
      });
      console.log('[PVC Payment] Razorpay order created:', order.id);
    } catch (razorpayError: any) {
      console.error('[PVC Payment] Razorpay API error:', razorpayError);
      errorDetails = razorpayError.message || 'Unknown Razorpay error';
      
      return NextResponse.json(
        { 
          error: 'Failed to create payment order with payment gateway',
          code: 'RAZORPAY_API_ERROR',
          details: razorpayError.message || 'Razorpay API request failed'
        },
        { status: 503 }
      );
    }

    // Update session with order ID
    await prisma.pvcComparisonSession.update({
      where: { sessionToken },
      data: {
        razorpayOrderId: order.id,
      },
    });

    const duration = Date.now() - startTime;
    console.log(`[PVC Payment] Payment order created successfully in ${duration}ms`);

    return NextResponse.json({
      orderId: order.id,
      amount: 250,
      currency: 'INR',
      keyId: keyIdSetting.value,
      sessionToken,
    });
  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.error('[PVC Payment] Error creating payment:', error);
    console.error('[PVC Payment] Error stack:', error.stack);
    console.error(`[PVC Payment] Failed after ${duration}ms`);
    
    // Check for database connection errors
    if (error.message?.includes('database') || error.message?.includes('connection')) {
      return NextResponse.json(
        { 
          error: 'Database connection error. Please try again.',
          code: 'DB_ERROR',
          details: 'Unable to connect to database'
        },
        { status: 503 }
      );
    }
    
    return NextResponse.json(
      { 
        error: 'Internal server error. Please try again later.',
        code: 'INTERNAL_ERROR',
        details: error.message || 'Unknown error occurred'
      },
      { status: 500 }
    );
  }
}
