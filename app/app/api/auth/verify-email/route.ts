
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// Force dynamic rendering for this route
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  // Get base URL with multiple fallbacks for reliability (declared outside try for catch block access)
  // Priority: 1) NEXTAUTH_URL env var, 2) x-forwarded-host header, 3) host header, 4) hardcoded fallback
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
  
  try {
    const searchParams = request.nextUrl.searchParams;
    const token = searchParams.get('token');

    console.log('[Email Verification] Request received');
    console.log('[Email Verification] NEXTAUTH_URL:', envUrl);
    console.log('[Email Verification] X-Forwarded-Host:', forwardedHost);
    console.log('[Email Verification] Host:', host);
    console.log('[Email Verification] Selected Base URL:', baseUrl);
    console.log('[Email Verification] Token present:', !!token);

    if (!token) {
      console.log('[Email Verification] Error: Missing token');
      return NextResponse.redirect(new URL('/auth/verify-error?error=missing_token', baseUrl));
    }

    // Find the verification token
    const verificationToken = await prisma.verificationToken.findUnique({
      where: { token },
    });

    if (!verificationToken) {
      console.log('[Email Verification] Error: Invalid or already used token');
      return NextResponse.redirect(new URL('/auth/verify-error?error=invalid_token', baseUrl));
    }

    // Check if token has expired
    if (verificationToken.expires < new Date()) {
      console.log('[Email Verification] Error: Token expired');
      await prisma.verificationToken.delete({
        where: { token },
      });
      return NextResponse.redirect(new URL('/auth/verify-error?error=expired_token', baseUrl));
    }

    console.log('[Email Verification] Verifying email for:', verificationToken.identifier);

    // Update user's emailVerified field
    await prisma.user.update({
      where: { email: verificationToken.identifier },
      data: { emailVerified: new Date() },
    });

    // Delete the verification token
    await prisma.verificationToken.delete({
      where: { token },
    });

    console.log('[Email Verification] Success! Redirecting to success page');
    const successUrl = new URL('/auth/verify-success', baseUrl);
    console.log('[Email Verification] Redirect URL:', successUrl.toString());
    
    return NextResponse.redirect(successUrl);
  } catch (error) {
    console.error('[Email Verification] Server error:', error);
    return NextResponse.redirect(new URL('/auth/verify-error?error=server_error', baseUrl));
  }
}
