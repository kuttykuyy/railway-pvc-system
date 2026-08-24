import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { normalizePhone, PHONE_FORMAT_MESSAGE, PHONE_TAKEN_MESSAGE } from '@/lib/phone-validation';
import { phoneIsTaken } from '@/lib/phone-owner';

export const dynamic = 'force-dynamic';

/**
 * Saves a mobile (WhatsApp) number for a signed-in user who doesn't have one yet
 * — e.g. Google sign-in accounts, which never provide a phone number. Enforced by
 * middleware, which blocks phone-less users until this succeeds.
 */
/**
 * Whether the signed-in user already has a phone, straight from the database.
 *
 * The middleware gates on the session token, which can lag the truth: a user who just
 * saved a number can carry a token still saying they have none, and every page then
 * bounces them back to the mobile form with an empty box — a loop with no way out. The
 * page asks here on load, and when the answer is "already saved" it refreshes the
 * session and moves on. This path is the one API the phone-gate exempts, which is
 * exactly why the check lives here and not on the profile route.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
  const dbUser = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { phone: true },
  });
  return NextResponse.json({ hasPhone: !!(dbUser?.phone && dbUser.phone.trim()) });
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { whatsappNumber } = await request.json().catch(() => ({}));
    const raw = String(whatsappNumber || '').trim();
    if (!raw) {
      return NextResponse.json({ error: 'Mobile number is required.' }, { status: 400 });
    }
    // Stored in one form, and only if no other account holds it — same rule as signup.
    // This is the one route the phone gate exempts, so it is also the one an account
    // without a number must pass through; it cannot be the looser of the two.
    const phone = normalizePhone(raw);
    if (!phone) {
      return NextResponse.json({ error: PHONE_FORMAT_MESSAGE }, { status: 400 });
    }
    const me = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    });
    if (await phoneIsTaken(phone, me?.id)) {
      return NextResponse.json({ error: PHONE_TAKEN_MESSAGE }, { status: 409 });
    }

    await prisma.user.update({
      where: { email: session.user.email },
      data: { phone },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('complete-mobile error:', error);
    return NextResponse.json({ error: 'Could not save your mobile number. Please try again.' }, { status: 500 });
  }
}
