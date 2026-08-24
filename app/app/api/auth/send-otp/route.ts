import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { sendOtpWhatsApp } from '@/lib/whatsapp-mydreams';
import { normalizePhone, PHONE_FORMAT_MESSAGE, PHONE_TAKEN_MESSAGE } from '@/lib/phone-validation';
import { accountsHoldingPhone } from '@/lib/phone-owner';
import { phoneOtpRequired, markOtpDeliveryBroken, markOtpDeliveryWorking } from '@/lib/phone-otp';
import { randomInt } from 'crypto';

export const dynamic = 'force-dynamic';

// Rate limit: max 5 OTPs per phone per hour
const MAX_OTPS_PER_HOUR = 5;
const OTP_EXPIRY_MINUTES = 5;
const COOLDOWN_SECONDS = 30;

/**
 * Whether the sign-up form has to ask for a code at all. Read by the form on load so
 * it can show the Verify step only when a code can actually be delivered.
 */
export async function GET() {
  return NextResponse.json({ required: await phoneOtpRequired() });
}

export async function POST(request: NextRequest) {
  try {
    const { phone: rawPhone } = await request.json();

    if (!rawPhone) {
      return NextResponse.json(
        { error: 'Phone number is required' },
        { status: 400 }
      );
    }

    // Everything downstream -- the stored row, the duplicate check, the verification
    // the signup route later spends -- works on the normalised number. Storing what was
    // typed here is what made the old duplicate check miss "9876543210" sitting beside
    // "+919876543210".
    const phone = normalizePhone(rawPhone);
    if (!phone) {
      return NextResponse.json({ error: PHONE_FORMAT_MESSAGE }, { status: 400 });
    }

    // Already somebody's? Matched across the old stored formats, not just this exact
    // string.
    const owners = await accountsHoldingPhone(phone);
    if (owners.length > 0) {
      return NextResponse.json(
        { error: PHONE_TAKEN_MESSAGE + ' If it is yours, please sign in instead.' },
        { status: 400 }
      );
    }

    // Check cooldown — last OTP sent less than 30s ago
    const recentOtp = await prisma.phoneOtp.findFirst({
      where: {
        phone,
        createdAt: { gte: new Date(Date.now() - COOLDOWN_SECONDS * 1000) },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (recentOtp) {
      const waitSeconds = Math.ceil(
        (recentOtp.createdAt.getTime() + COOLDOWN_SECONDS * 1000 - Date.now()) / 1000
      );
      return NextResponse.json(
        { error: `Please wait ${waitSeconds} seconds before requesting a new OTP` },
        { status: 429 }
      );
    }

    // Rate limit: max OTPs per hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const otpCount = await prisma.phoneOtp.count({
      where: {
        phone,
        createdAt: { gte: oneHourAgo },
      },
    });

    if (otpCount >= MAX_OTPS_PER_HOUR) {
      return NextResponse.json(
        { error: 'Too many OTP requests. Please try again after an hour.' },
        { status: 429 }
      );
    }

    // Generate 6-digit OTP
    const otp = randomInt(100000, 999999).toString();

    // Store OTP in database
    await prisma.phoneOtp.create({
      data: {
        phone,
        otp,
        expiresAt: new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000),
      },
    });

    // Send OTP via WhatsApp
    const result = await sendOtpWhatsApp(phone, otp);

    if (!result.success) {
      console.error('[OTP] Failed to send WhatsApp OTP:', result.error);
      // Trip the breaker: a code that cannot be delivered must not become a wall
      // between a new user and the product. The signup route reads this and stops
      // demanding proof until the channel is working again.
      await markOtpDeliveryBroken(result.error || 'send failed');
      return NextResponse.json(
        {
          error: 'We could not send the code right now, so verification has been skipped. '
            + 'You can carry on and finish signing up.',
          verificationUnavailable: true,
        },
        { status: 503 },
      );
    }
    // It worked, so whatever was wrong is not wrong now.
    await markOtpDeliveryWorking();

    logger.log('[OTP] ✅ OTP sent to:', phone);

    return NextResponse.json({
      success: true,
      message: 'OTP sent to your WhatsApp number',
      expiresIn: OTP_EXPIRY_MINUTES * 60, // seconds
    });
  } catch (error) {
    console.error('[OTP] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error. Please try again.' },
      { status: 500 }
    );
  }
}

