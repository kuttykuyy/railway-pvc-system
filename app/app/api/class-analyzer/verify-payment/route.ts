
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

    // The order being verified must be the one this session was sold under. Without
    // this, any valid (order, payment, signature) triple from the user's own past — a
    // wallet top-up, say — marked the session paid.
    if (!pvcSession.razorpayOrderId || pvcSession.razorpayOrderId !== razorpay_order_id) {
      return NextResponse.json(
        { error: 'This payment does not belong to this session' },
        { status: 400 }
      );
    }

    // Get Razorpay credentials
    const [keyIdSetting, keySecretSetting] = await Promise.all([
      prisma.adminSettings.findUnique({ where: { key: 'razorpay_key_id' } }),
      prisma.adminSettings.findUnique({ where: { key: 'razorpay_key_secret' } }),
    ]);

    if (!keySecretSetting?.value || !keyIdSetting?.value) {
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

    // Constant-time compare to avoid leaking the signature via timing.
    const sigValid =
      typeof razorpay_signature === 'string' &&
      expectedSignature.length === razorpay_signature.length &&
      crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(razorpay_signature));
    if (!sigValid) {
      return NextResponse.json(
        { error: 'Invalid payment signature' },
        { status: 400 }
      );
    }

    // The signature binds payment to order; Razorpay's own record must say the money
    // was captured, for this order, in the amount the session was priced at.
    try {
      const Razorpay = (await import('razorpay')).default;
      const razorpay = new Razorpay({ key_id: keyIdSetting.value, key_secret: keySecretSetting.value });
      const payment: any = await razorpay.payments.fetch(razorpay_payment_id);
      const expectedPaise = Math.round(Number(pvcSession.amount || 250) * 100);
      if (payment.status !== 'captured') {
        return NextResponse.json(
          { error: 'Payment is not captured yet. Please try again in a moment.' },
          { status: 409 }
        );
      }
      if (payment.order_id !== razorpay_order_id || Math.abs(Number(payment.amount) - expectedPaise) > 1 || (payment.currency && payment.currency !== 'INR')) {
        console.error('[PVC Payment] payment does not match session order:', { paymentOrder: payment.order_id, sessionOrder: razorpay_order_id, amount: payment.amount, expectedPaise });
        return NextResponse.json(
          { error: 'Payment does not match this order' },
          { status: 400 }
        );
      }
    } catch (fetchError: any) {
      console.error('[PVC Payment] could not fetch payment from Razorpay:', fetchError?.message || fetchError);
      return NextResponse.json(
        { error: 'Payment verification failed. Please try again.' },
        { status: 502 }
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
