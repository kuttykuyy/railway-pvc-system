import { logger } from '@/lib/logger';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { emailLinkOrigin } from '@/lib/email-link-origin';

// Force dynamic rendering for this route
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  // A fixed origin, never the request's own headers — see lib/email-link-origin.ts.
  // This decides where the user is sent after their address is verified, so a forged
  // X-Forwarded-Host landed them on someone else's site holding a fresh session.
  const baseUrl = emailLinkOrigin();

  try {
    const searchParams = request.nextUrl.searchParams;
    const token = searchParams.get('token');

    logger.log('[Email Verification] Request received');
    logger.log('[Email Verification] Selected Base URL:', baseUrl);
    logger.log('[Email Verification] Token present:', !!token);

    if (!token) {
      logger.log('[Email Verification] Error: Missing token');
      return NextResponse.redirect(new URL('/auth/verify-error?error=missing_token', baseUrl));
    }

    // Find the verification token
    const verificationToken = await prisma.verificationToken.findUnique({
      where: { token },
    });

    if (!verificationToken) {
      logger.log('[Email Verification] Error: Invalid or already used token');
      return NextResponse.redirect(new URL('/auth/verify-error?error=invalid_token', baseUrl));
    }

    // Check if token has expired
    if (verificationToken.expires < new Date()) {
      logger.log('[Email Verification] Error: Token expired');
      await prisma.verificationToken.delete({
        where: { token },
      });
      return NextResponse.redirect(new URL('/auth/verify-error?error=expired_token', baseUrl));
    }

    logger.log('[Email Verification] Verifying email for:', verificationToken.identifier);

    // Update user's emailVerified field
    await prisma.user.update({
      where: { email: verificationToken.identifier },
      data: { emailVerified: new Date() },
    });

    // Delete the verification token
    await prisma.verificationToken.delete({
      where: { token },
    });

    logger.log('[Email Verification] Success! Redirecting to success page');
    const successUrl = new URL('/auth/verify-success', baseUrl);
    logger.log('[Email Verification] Redirect URL:', successUrl.toString());
    
    return NextResponse.redirect(successUrl);
  } catch (error) {
    console.error('[Email Verification] Server error:', error);
    return NextResponse.redirect(new URL('/auth/verify-error?error=server_error', baseUrl));
  }
}

