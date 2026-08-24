import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { normalizePhone, PHONE_FORMAT_MESSAGE } from '@/lib/phone-validation';

export const dynamic = 'force-dynamic';

const MAX_ATTEMPTS = 3;

export async function POST(request: NextRequest) {
  try {
    const { phone: rawPhone, otp } = await request.json();

    if (!rawPhone || !otp) {
      return NextResponse.json(
        { error: 'Phone number and OTP are required' },
        { status: 400 }
      );
    }

    // Same normalised form the code was stored against, or the row is never found.
    const phone = normalizePhone(rawPhone);
    if (!phone) {
      return NextResponse.json({ error: PHONE_FORMAT_MESSAGE }, { status: 400 });
    }

    // Find the latest non-expired, non-verified OTP for this phone
    const otpRecord = await prisma.phoneOtp.findFirst({
      where: {
        phone,
        verified: false,
        expiresAt: { gte: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!otpRecord) {
      return NextResponse.json(
        { error: 'OTP expired or not found. Please request a new OTP.' },
        { status: 400 }
      );
    }

    // Check max attempts
    if (otpRecord.attempts >= MAX_ATTEMPTS) {
      return NextResponse.json(
        { error: 'Too many wrong attempts. Please request a new OTP.' },
        { status: 400 }
      );
    }

    // Verify OTP
    if (otpRecord.otp !== otp.trim()) {
      // Increment attempts
      await prisma.phoneOtp.update({
        where: { id: otpRecord.id },
        data: { attempts: { increment: 1 } },
      });

      const remaining = MAX_ATTEMPTS - otpRecord.attempts - 1;
      return NextResponse.json(
        { 
          error: remaining > 0 
            ? `Incorrect OTP. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`
            : 'Incorrect OTP. Please request a new OTP.',
          attemptsRemaining: remaining 
        },
        { status: 400 }
      );
    }

    // OTP matches — mark as verified
    await prisma.phoneOtp.update({
      where: { id: otpRecord.id },
      data: { verified: true },
    });

    logger.log('[OTP] ✅ Phone verified:', phone);

    return NextResponse.json({
      success: true,
      message: 'Phone number verified successfully',
      verifiedPhone: phone,
    });
  } catch (error) {
    console.error('[OTP] Verification error:', error);
    return NextResponse.json(
      { error: 'Internal server error. Please try again.' },
      { status: 500 }
    );
  }
}

