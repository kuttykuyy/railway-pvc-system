/**
 * API endpoint to update user phone number
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { normalizePhone, PHONE_FORMAT_MESSAGE, PHONE_TAKEN_MESSAGE } from '@/lib/phone-validation';
import { phoneIsTaken } from '@/lib/phone-owner';

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { phone: raw } = await req.json();

    // A mobile number is mandatory, so this route may not remove one.
    //
    // It used to write `phone: phone || null`, which meant posting an empty string here
    // cleared the field the middleware exists to require. The session still said the
    // account had a number, so nothing bounced them until it next expired — a way to
    // opt out of a rule by using the form meant for keeping it up to date.
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

    // Update user phone number
    const updatedUser = await prisma.user.update({
      where: { email: session.user.email },
      data: { phone },
      select: {
        id: true,
        phone: true,
        name: true,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Phone number updated successfully',
      phone: updatedUser.phone,
    });
  } catch (error: any) {
    console.error('Error updating phone number:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update phone number' },
      { status: 500 }
    );
  }
}
