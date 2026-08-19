import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import crypto from 'crypto';
import { resend, getResetPasswordEmailHtml } from '@/lib/resend';
import { emailLinkOrigin } from '@/lib/email-link-origin';

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json(
        { message: 'Email is required' },
        { status: 400 }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    // For security, always return success even if user doesn't exist
    // This prevents email enumeration attacks
    if (!user) {
      logger.log(`Password reset requested for non-existent email: ${normalizedEmail}`);
      return NextResponse.json(
        { message: 'If an account exists with this email, you will receive a password reset link.' },
        { status: 200 }
      );
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpiry = new Date(Date.now() + 3600000); // 1 hour from now

    // Save token to database
    await prisma.user.update({
      where: { id: user.id },
      data: {
        resetToken,
        resetTokenExpiry,
      },
    });

    // Built from a fixed origin, never from the request. This used to fall back to the
    // X-Forwarded-Host header whenever NEXTAUTH_URL did not contain "irpvc.in" — which
    // is always, because NEXTAUTH_URL names the platform host here. A forged header
    // therefore put an attacker's domain into an email carrying this real reset token.
    const baseUrl = emailLinkOrigin();

    const resetUrl = `${baseUrl}/auth/reset-password?token=${resetToken}`;

    logger.log('Password Reset URL Generation:');
    logger.log('- Selected Base URL:', baseUrl);

    // Send password reset email
    try {
      await resend.emails.send({
        from: 'Railway PVC System <noreply@irpvc.in>',
        to: user.email,
        subject: 'Reset Your Password - Railway PVC System',
        html: getResetPasswordEmailHtml(resetUrl, user.email),
      });

      logger.log(`Password reset email sent successfully to: ${user.email}`);
    } catch (emailError) {
      console.error('Failed to send password reset email:', emailError);
      // Don't reveal email sending failure to user for security
    }

    return NextResponse.json(
      { message: 'If an account exists with this email, you will receive a password reset link.' },
      { status: 200 }
    );
  } catch (error) {
    console.error('Forgot password error:', error);
    return NextResponse.json(
      { message: 'An error occurred. Please try again.' },
      { status: 500 }
    );
  }
}

