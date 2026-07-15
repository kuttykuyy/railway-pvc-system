import { logger } from '@/lib/logger';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { randomBytes } from 'crypto';
import { resend, getVerificationEmailHtml } from '@/lib/resend';

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Check if already verified
    if (user.emailVerified) {
      return NextResponse.json(
        { error: 'Email is already verified' },
        { status: 400 }
      );
    }

    // Delete any existing verification tokens for this email
    await prisma.verificationToken.deleteMany({
      where: { identifier: user.email },
    });

    // Generate new verification token
    const token = randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now

    // Create new verification token
    await prisma.verificationToken.create({
      data: {
        identifier: user.email,
        token,
        expires,
      },
    });

    // Get base URL
    const envUrl = process.env.NEXTAUTH_URL?.replace(/\/$/, '');
    const forwardedHost = request.headers.get('x-forwarded-host');
    const host = request.headers.get('host');
    
    let baseUrl: string;
    if (envUrl && envUrl.includes('irpvc.in')) {
      baseUrl = envUrl;
    } else if (forwardedHost) {
      baseUrl = `https://${forwardedHost}`;
    } else if (host && host.includes('irpvc.in')) {
      baseUrl = `https://${host}`;
    } else {
      baseUrl = 'https://irpvc.in';
    }
    
    const verificationUrl = `${baseUrl}/api/auth/verify-email?token=${token}`;

    logger.log('[Resend Verification] Sending email to:', user.email);
    logger.log('[Resend Verification] Verification URL:', verificationUrl);

    const { data, error: sendError } = await resend.emails.send({
      from: 'Railway PVC System <noreply@irpvc.in>',
      to: user.email,
      subject: 'Verify your email address — IR-PVC',
      html: getVerificationEmailHtml(verificationUrl, user.email),
    });

    // Resend reports API failures in the RESPONSE, not by throwing. Without this the
    // route told the user "sent successfully" while nothing was delivered — leaving
    // them permanently unable to verify.
    if (sendError) {
      const message = (sendError as any)?.message || JSON.stringify(sendError);
      console.error('❌ Resend verification failed for', user.email, ':', message);
      return NextResponse.json(
        { error: 'We could not send the verification email right now. Please try again shortly or contact support.' },
        { status: 502 }
      );
    }

    logger.log('✅ Verification email resent to:', user.email, data?.id ? `(id ${data.id})` : '');

    return NextResponse.json(
      { message: 'Verification email sent successfully' },
      { status: 200 }
    );
  } catch (error) {
    console.error('❌ Resend verification error:', error);
    return NextResponse.json(
      { error: 'Failed to send verification email' },
      { status: 500 }
    );
  }
}

