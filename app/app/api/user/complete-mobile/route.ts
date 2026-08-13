import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { validatePhoneNumber } from '@/lib/phone-validation';

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
    const phone = String(whatsappNumber || '').trim();
    if (!phone) {
      return NextResponse.json({ error: 'Mobile number is required.' }, { status: 400 });
    }
    if (!validatePhoneNumber(phone)) {
      return NextResponse.json(
        { error: 'Invalid format. Use +[country code][number], e.g. +919876543210.' },
        { status: 400 },
      );
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
