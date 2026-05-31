import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { validatePhoneNumber, sendOtpWhatsApp } from '@/lib/whatsapp-mydreams';
import { randomInt } from 'crypto';

export const dynamic = 'force-dynamic';

// Rate limit: max 5 OTPs per phone per hour
const MAX_OTPS_PER_HOUR = 5;
const OTP_EXPIRY_MINUTES = 5;
const COOLDOWN_SECONDS = 30;

export async function POST(request: NextRequest) {
  try {
    const { phone } = await request.json();

    if (!phone) {
      return NextResponse.json(
        { error: 'Phone number is required' },
        { status: 400 }
      );
    }

    if (!validatePhoneNumber(phone)) {
      return NextResponse.json(
        { error: 'Invalid phone number format. Use: +[country code][number]' },
        { status: 400 }
      );
    }

    // Check if phone is already registered
    const existingUser = await prisma.user.findFirst({
      where: { phone },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: 'This WhatsApp number is already registered. Please sign in instead.' },
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
      return NextResponse.json(
        { error: 'Failed to send OTP via WhatsApp. Please check your number and try again.' },
        { status: 500 }
      );
    }

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

