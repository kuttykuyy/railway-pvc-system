import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { activeGateway, setActiveGateway, type Gateway } from '@/lib/payment-gateway';
import { isCashfreeConfigured, getCashfreeDiagnostics } from '@/lib/cashfree';
import { isRazorpayEnabled } from '@/lib/razorpay';

export const dynamic = 'force-dynamic';

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return { ok: false as const, status: 401, error: 'Unauthorized' };
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { role: true, email: true },
  });
  if (user?.role !== 'admin' && user?.role !== 'superadmin') {
    return { ok: false as const, status: 403, error: 'Admin access required' };
  }
  return { ok: true as const, email: user.email };
}

/** Which gateway is live, and whether each one is actually usable. */
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const [active, cashfree] = await Promise.all([activeGateway(), getCashfreeDiagnostics()]);
  return NextResponse.json({
    active,
    razorpay: { configured: isRazorpayEnabled() },
    cashfree: { configured: cashfree.configured, mode: cashfree.mode },
  });
}

/**
 * Switch the live gateway.
 *
 * Refuses to select a gateway that has no credentials — the whole point of the switch is
 * to move to something that works, and pointing every customer at a checkout that cannot
 * open is the opposite of that.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json().catch(() => ({}));
  const gateway = String(body?.gateway || '').toLowerCase() as Gateway;
  if (gateway !== 'razorpay' && gateway !== 'cashfree') {
    return NextResponse.json({ error: 'Choose razorpay or cashfree.' }, { status: 400 });
  }

  if (gateway === 'cashfree' && !(await isCashfreeConfigured())) {
    return NextResponse.json(
      { error: 'Cashfree has no credentials set. Add cashfree_app_id and cashfree_secret_key first.' },
      { status: 400 },
    );
  }
  if (gateway === 'razorpay' && !isRazorpayEnabled()) {
    return NextResponse.json(
      { error: 'Razorpay is not configured. Set its keys before switching to it.' },
      { status: 400 },
    );
  }

  await setActiveGateway(gateway, auth.email || undefined);
  return NextResponse.json({ active: gateway });
}
