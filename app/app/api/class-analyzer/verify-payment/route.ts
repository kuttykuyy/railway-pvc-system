
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import crypto from 'crypto';

// POST /api/pvc-comparison/verify-payment
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const userId = (session.user as any).id as string;
    const { 
      razorpay_order_id, 
      razorpay_payment_id, 
      razorpay_signature, 
      sessionToken 
    } = await request.json();

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !sessionToken) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Check if session exists
    const pvcSession = await prisma.pvcComparisonSession.findUnique({
      where: { sessionToken },
    });

    if (!pvcSession || pvcSession.userId !== userId) {
      return NextResponse.json(
        { error: 'Invalid session' },
        { status: 404 }
      );
    }

    // Get Razorpay secret
    const keySecretSetting = await prisma.adminSettings.findUnique({
      where: { key: 'razorpay_key_secret' },
    });

    if (!keySecretSetting?.value) {
      return NextResponse.json(
        { error: 'Payment system not configured' },
        { status: 503 }
      );
    }

    // Verify signature
    const body = razorpay_order_id + '|' + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac('sha256', keySecretSetting.value)
      .update(body.toString())
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      return NextResponse.json(
        { error: 'Invalid payment signature' },
        { status: 400 }
      );
    }

    // Update session as paid
    await prisma.pvcComparisonSession.update({
      where: { sessionToken },
      data: {
        paymentStatus: 'paid',
        razorpayPaymentId: razorpay_payment_id,
        razorpaySignature: razorpay_signature,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // Extend for 24 hours
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Payment verified successfully',
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });
  } catch (error) {
    console.error('Error verifying payment for PVC comparison:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
