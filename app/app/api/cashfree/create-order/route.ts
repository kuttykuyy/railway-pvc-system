import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { schemaQualified } from '@/lib/db-schema';
import { calculateGst } from '@/lib/gst-invoice';
import { createCashfreeOrder, getCashfreeConfig } from '@/lib/cashfree';
import { emailLinkOrigin } from '@/lib/email-link-origin';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const MIN_TOPUP_AMOUNT = 1000;

/**
 * Open a Cashfree order for a credit top-up.
 *
 * The customer chooses ONE thing: how many credits to buy. Everything with money in it —
 * the GST, the total charged — is worked out on the server from that single number. The
 * client's own totalAmount and gstAmount are never trusted, because a value that arrives
 * in a request body is a value a customer can edit, and the one time this app trusted
 * the client's GST basis it charged the wrong amount.
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const config = await getCashfreeConfig();
  if (!config) {
    return NextResponse.json({ error: 'Cashfree is not configured' }, { status: 503 });
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, email: true, name: true, phone: true },
  });
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  if (!user.phone) {
    // Cashfree requires a customer phone. The number is verified and stored by now, so
    // this only bites an account that predates the mobile requirement.
    return NextResponse.json(
      { error: 'Add your mobile number in your profile before paying.' },
      { status: 400 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const creditAmount = Number(body?.creditAmount);
  if (!Number.isFinite(creditAmount) || creditAmount < MIN_TOPUP_AMOUNT) {
    return NextResponse.json(
      { error: `The smallest top-up is ₹${MIN_TOPUP_AMOUNT}.` },
      { status: 400 },
    );
  }

  // GST added on top of the credits, worked out here and nowhere else.
  const gst = calculateGst(creditAmount, false, 'exclusive');
  const gstAmount = gst.totalGst;
  const totalAmount = gst.totalAmount;

  // A short, unique, gateway-safe order id. Cashfree allows letters, digits, hyphen and
  // underscore; the random suffix keeps two same-second orders apart.
  const orderId = `irpvc_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const paymentId = crypto.randomUUID();
  const receipt = `rcpt_${Date.now()}`;

  const order = await createCashfreeOrder({
    orderId,
    amount: totalAmount,
    customerId: user.id,
    customerPhone: user.phone.replace(/\D/g, '').slice(-10) || user.phone,
    customerEmail: user.email,
    customerName: user.name || undefined,
    // Cashfree appends its own params; the browser SDK also gives us the outcome, and the
    // verify route confirms it with Cashfree regardless of what the return carries.
    returnUrl: `${emailLinkOrigin()}/profile?cf_order={order_id}`,
    notes: { userId: user.id, userEmail: user.email, creditAmount: String(creditAmount) },
  });

  if (order.ok === false) {
    logger.error('[cashfree/create-order] order failed:', order.error);
    return NextResponse.json({ error: order.error }, { status: 502 });
  }

  // Record it as 'created'. The money has not moved; this is the row the webhook and the
  // verify route will both look for by orderId.
  try {
    const table = await schemaQualified('payment_transactions');
    await prisma.$executeRawUnsafe(
      `INSERT INTO ${table}
        (id, gateway, "userId", "orderId", "gatewayOrderId", amount, currency, status,
         "creditAmount", "gstAmount", "totalAmount", receipt, notes)
       VALUES ($1, 'cashfree', $2, $3, $4, $5, 'INR', 'created', $6, $7, $8, $9, $10::jsonb)`,
      paymentId, user.id, orderId, order.order.orderId,
      totalAmount, creditAmount, gstAmount, totalAmount, receipt,
      JSON.stringify({ userId: user.id, userEmail: user.email, creditAmount }),
    );
  } catch (error: any) {
    // The order exists at Cashfree but we could not record it. Do NOT hand the browser a
    // session for a payment we cannot later credit — it would take money we then cannot
    // attribute. Fail loudly.
    logger.error('[cashfree/create-order] could not record the order:', error?.message);
    return NextResponse.json(
      { error: 'Could not start the payment. Nothing was charged. Please try again.' },
      { status: 500 },
    );
  }

  return NextResponse.json({
    orderId,
    paymentSessionId: order.order.paymentSessionId,
    mode: config.mode,
    creditAmount,
    gstAmount,
    totalAmount,
  });
}
