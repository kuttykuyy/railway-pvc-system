import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCashfreeConfig, verifyCashfreeWebhook, fetchCashfreeOrder, cashfreeOrderIsPaid } from '@/lib/cashfree';
import { findPaymentByOrderId, creditPaymentOnce } from '@/lib/payment-credit';
import { runPaymentSideEffects } from '@/lib/payment-side-effects';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

/**
 * Cashfree's own word that a payment happened — the path that does not depend on the
 * customer's browser coming back at all (they close the tab, their phone dies, the app
 * redirect fails). It is the reliable one, and it is signed.
 *
 * The signature is checked against the RAW body exactly as it arrived — see
 * verifyCashfreeWebhook. So the body is read as text and never parsed before verifying;
 * parsing and re-serialising would change the bytes and every genuine webhook would be
 * rejected.
 */
export async function POST(request: NextRequest) {
  const config = await getCashfreeConfig();
  if (!config) {
    // Nothing to verify against. 200 so Cashfree does not retry forever against a
    // gateway that is not even configured here.
    return NextResponse.json({ ok: true, ignored: 'cashfree not configured' });
  }

  const rawBody = await request.text();
  const timestamp = request.headers.get('x-webhook-timestamp') || '';
  const signature = request.headers.get('x-webhook-signature') || '';

  if (!verifyCashfreeWebhook({ rawBody, timestamp, signature, secretKey: config.secretKey })) {
    // A webhook that does not verify is not from Cashfree. 401, and nothing is credited.
    logger.error('[cashfree/webhook] signature did not verify — ignoring');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let event: any = {};
  try { event = JSON.parse(rawBody); } catch { /* keep {} */ }

  const orderId = String(event?.data?.order?.order_id || '').trim();
  if (!orderId) {
    // A verified event we do not act on — a refund notice, say. Acknowledged so it is
    // not retried.
    return NextResponse.json({ ok: true, ignored: 'no order id' });
  }

  const payment = await findPaymentByOrderId('cashfree', orderId);
  if (!payment) {
    logger.warn('[cashfree/webhook] no local record for order', orderId);
    return NextResponse.json({ ok: true, ignored: 'unknown order' });
  }

  // The webhook says paid, but the app asks Cashfree itself before moving money. A
  // signature proves the message is from Cashfree; fetching the order proves the state
  // is current — a later refund or chargeback has moved on from what this message froze.
  const order = await fetchCashfreeOrder(orderId);
  if (order.ok === false) {
    logger.log('[cashfree/webhook] could not read the order, not crediting:', orderId, order.error);
    return NextResponse.json({ ok: true, credited: false });
  }
  if (!cashfreeOrderIsPaid(order.status)) {
    logger.log('[cashfree/webhook] order not in PAID state, not crediting:', orderId, order.status);
    return NextResponse.json({ ok: true, credited: false });
  }

  const result = await creditPaymentOnce({ payment, gatewayPaymentId: orderId, paymentMethod: 'cashfree' });
  if (result.credited) {
    const user = await prisma.user.findUnique({
      where: { id: payment.userId },
      select: { id: true, email: true, name: true, phone: true, gstin: true },
    });
    if (user) {
      await runPaymentSideEffects({
        payment, user, creditsAdded: result.creditsAdded, newBalance: result.newBalance,
      }).catch(err => logger.error('[cashfree/webhook] side effects failed:', err));
    }
  }

  return NextResponse.json({ ok: true, credited: result.credited });
}
