import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import crypto from 'crypto';
import { resend } from '@/lib/resend';
import ResetPasswordEmail from '@/emails/reset-password-email';

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
      console.log(`Password reset requested for non-existent email: ${normalizedEmail}`);
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

    // Generate reset URL - use the same logic as signup verification
    let baseUrl = '';
    
    // Priority 1: Use NEXTAUTH_URL if it contains irpvc.in
    if (process.env.NEXTAUTH_URL && process.env.NEXTAUTH_URL.includes('irpvc.in')) {
      baseUrl = process.env.NEXTAUTH_URL;
    } 
    // Priority 2: Check X-Forwarded-Host header
    else if (request.headers.get('x-forwarded-host')) {
      const forwardedHost = request.headers.get('x-forwarded-host');
      baseUrl = `https://${forwardedHost}`;
    } 
    // Priority 3: Check Host header if it contains irpvc.in
    else if (request.headers.get('host')?.includes('irpvc.in')) {
      const host = request.headers.get('host');
      baseUrl = `https://${host}`;
    } 
    // Fallback: Use hardcoded production URL
    else {
      baseUrl = 'https://irpvc.in';
    }

    const resetUrl = `${baseUrl}/auth/reset-password?token=${resetToken}`;

    console.log('Password Reset URL Generation:');
    console.log('- NEXTAUTH_URL:', process.env.NEXTAUTH_URL);
    console.log('- X-Forwarded-Host:', request.headers.get('x-forwarded-host'));
    console.log('- Host:', request.headers.get('host'));
    console.log('- Selected Base URL:', baseUrl);
    console.log('- Reset URL:', resetUrl);

    // Send password reset email
    try {
      await resend.emails.send({
        from: 'Railway PVC System <noreply@irpvc.in>',
        to: user.email,
        subject: 'Reset Your Password - Railway PVC System',
        react: ResetPasswordEmail({
          resetUrl,
          userEmail: user.email,
        }),
      });

      console.log(`Password reset email sent successfully to: ${user.email}`);
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
