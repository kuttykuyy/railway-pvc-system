import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { fetchCashfreeOrder, cashfreeOrderIsPaid } from '@/lib/cashfree';
import { findPaymentByOrderId, creditPaymentOnce } from '@/lib/payment-credit';
import { runPaymentSideEffects } from '@/lib/payment-side-effects';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

/**
 * The browser is back from Cashfree's checkout. Confirm the money with CASHFREE, not
 * with the browser, and credit if it is really there.
 *
 * This is one of two independent paths that can credit an order — the webhook is the
 * other — and creditPaymentOnce guarantees that between them the wallet moves once.
 * Either can arrive first; both call the same guard.
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, email: true, name: true, phone: true, gstin: true },
  });
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const orderId = String(body?.orderId || '').trim();
  if (!orderId) return NextResponse.json({ error: 'orderId is required' }, { status: 400 });

  const payment = await findPaymentByOrderId('cashfree', orderId);
  if (!payment) return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  // The order belongs to the person asking — an order id is guessable, crediting is not.
  if (payment.userId !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Ask Cashfree. This, and the webhook signature, are the only things that grant credit.
  const order = await fetchCashfreeOrder(orderId);
  if (order.ok === false) {
    logger.error('[cashfree/verify] could not read the order:', order.error);
    return NextResponse.json(
      { error: 'Could not confirm the payment yet. If money was deducted, it will be credited automatically.' },
      { status: 502 },
    );
  }

  if (!cashfreeOrderIsPaid(order.status)) {
    return NextResponse.json({
      success: false,
      status: order.status,
      message: order.status === 'ACTIVE'
        ? 'The payment has not completed yet.'
        : `Payment ${order.status.toLowerCase()}.`,
    }, { status: 409 });
  }

  const result = await creditPaymentOnce({
    payment, gatewayPaymentId: orderId, paymentMethod: 'cashfree', paidAmount: order.amount,
  });
  if (result.credited) {
    // Only the winning path runs these, and never in the request's critical path.
    await runPaymentSideEffects({
      payment, user, creditsAdded: result.creditsAdded, newBalance: result.newBalance,
    }).catch(err => logger.error('[cashfree/verify] side effects failed:', err));
  }

  return NextResponse.json({
    success: true,
    creditAmount: result.creditsAdded,
    gstAmount: payment.gstAmount,
    totalAmount: payment.totalAmount,
    alreadyProcessed: !result.credited,
  });
}
