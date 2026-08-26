import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { activeGateway } from '@/lib/payment-gateway';
import { getRazorpayKeyId } from '@/lib/razorpay';
import { getCashfreeConfig } from '@/lib/cashfree';

export const dynamic = 'force-dynamic';

/**
 * Which gateway the top-up dialog should open, and the one public value it needs to do
 * so — Razorpay's key id, or Cashfree's mode. Nothing secret: the Razorpay key id and
 * the Cashfree mode are both meant for the browser. The secret keys never leave the
 * server.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const gateway = await activeGateway();

  if (gateway === 'cashfree') {
    const config = await getCashfreeConfig();
    return NextResponse.json({ gateway: 'cashfree', mode: config?.mode ?? 'sandbox' });
  }

  return NextResponse.json({ gateway: 'razorpay', keyId: getRazorpayKeyId() });
}
