import { getToken } from "next-auth/jwt";
import { NextRequest, NextResponse } from "next/server";

function getAuthSecret(): string {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error("NEXTAUTH_SECRET environment variable is not set");
  }
  return secret;
}

export async function middleware(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl;

  // The Class Analyzer page (and its older /pvc-comparison address) is gone — it was
  // reachable from no menu, and /indices/comparison does the comparing. Its payment
  // API routes stay, unreachable, so any session data is preserved. An old bookmark
  // lands on the live comparison tool rather than a 404.
  if (pathname.startsWith('/pvc-comparison') || pathname.startsWith('/class-analyzer')) {
    const newUrl = new URL(req.url);
    newUrl.pathname = '/indices/comparison';
    return NextResponse.redirect(newUrl);
  }

  if (pathname.startsWith('/api/pvc-comparison')) {
    const newUrl = new URL(req.url);
    newUrl.pathname = pathname.replace('/api/pvc-comparison', '/api/class-analyzer');
    return NextResponse.redirect(newUrl);
  }

  // Public PDF access is validated inside the route handler, not here.
  // The middleware only ensures the request reaches the handler; auth bypass
  // is never granted based solely on the presence of query parameters.

  // Allow access to auth pages and API routes without token
  if (pathname.startsWith('/auth/') ||
      pathname.startsWith('/api/auth/') ||
      pathname.startsWith('/api/signup') ||
      pathname.startsWith('/api/public/') ||
      pathname.startsWith('/api/health/') ||
      pathname.startsWith('/api/whatsapp/webhook') ||
      pathname.startsWith('/api/razorpay/webhook') ||
      pathname.startsWith('/api/cashfree/webhook') ||
      pathname.startsWith('/api/cron/') ||
      pathname.startsWith('/api/external/') ||
      pathname.startsWith('/api/try-bill/preview') ||
      pathname.startsWith('/api/classifications/active')) {
    // Scheduled/cron + webhook routes authenticate themselves (CRON_SECRET / webhook
    // signatures), so they must not be bounced to the login page.
    return NextResponse.next();
  }

  // Allow public policy and info pages. Help and Getting Started are documentation —
  // the pages that answer "how do I calculate PVC" searches — and neither reads the
  // session; keeping them behind the login sent every crawler to the sign-in page.
  if (pathname.startsWith('/terms') || 
      pathname.startsWith('/privacy') ||
      pathname.startsWith('/help') ||
      pathname.startsWith('/getting-started') ||
      pathname.startsWith('/refund') ||
      pathname.startsWith('/contact') ||
      pathname.startsWith('/payment-guide') ||
      pathname.startsWith('/about') ||
      pathname.startsWith('/how-it-works') ||
      pathname.startsWith('/pricing')) {
    return NextResponse.next();
  }

  // Allow public assets and PWA files
  if (pathname.startsWith('/_next/') ||
      pathname.startsWith('/favicon') ||
      pathname === '/manifest.json' ||
      pathname === '/sw.js' ||
      pathname.startsWith('/icons/')) {
    return NextResponse.next();
  }

  // Allow public try-bill landing page
  if (pathname.startsWith('/try-bill')) {
    return NextResponse.next();
  }

  // For root path, redirect authenticated users to /contracts
  if (pathname === '/') {
    const rootToken = await getToken({
      req,
      secret: getAuthSecret(),
      secureCookie: true
    });
    if (rootToken) {
      return NextResponse.redirect(new URL('/contracts', req.url));
    }
    return NextResponse.next();
  }

  // Allow SEO files (sitemap, robots.txt) and ads.txt
  if (pathname === '/sitemap.xml' || 
      pathname === '/robots.txt' ||
      pathname === '/ads.txt') {
    return NextResponse.next();
  }

  // Allow public image files
  if (pathname.match(/\.(png|jpg|jpeg|gif|svg|ico|webp)$/i)) {
    return NextResponse.next();
  }

  // Check token for protected routes using secure cookies only
  const token = await getToken({ 
    req, 
    secret: getAuthSecret(),
    secureCookie: true
  });

  if (!token) {
    const signInUrl = new URL('/auth/signin', req.url);
    signInUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(signInUrl);
  }

  // Mobile number is mandatory. Accounts created without one (e.g. Google sign-in)
  // must add it before using the app. Gate only when the token EXPLICITLY reports
  // no phone (hasPhone === false), so sessions issued before this rule — where the
  // flag is undefined — are never disrupted. Staff roles are exempt.
  const roleExempt = ['admin', 'superadmin', 'railway_official'].includes((token as any).role);
  if ((token as any).hasPhone === false && !roleExempt && pathname !== '/api/user/complete-mobile') {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: 'A mobile number is required. Please add it to continue.', code: 'MOBILE_REQUIRED' },
        { status: 403 },
      );
    }
    return NextResponse.redirect(new URL('/auth/complete-mobile', req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api/auth (NextAuth API routes) 
     * - api/public (Public API routes)
     * - api/v1 (Public API v1 - API key authentication)
     * - api/whatsapp/webhook (WhatsApp webhook endpoint)
     * - api/razorpay/webhook (Razorpay webhook endpoint)
     * - api/cashfree/webhook (Cashfree webhook endpoint)
     * - api/pdf-to-markdown (internal-secret authenticated Python function)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - manifest.json (PWA manifest)
     * - sw.js (service worker)
     * - icons/ (PWA icons)
     * - sitemap.xml (SEO sitemap)
     * - robots.txt (SEO robots file)
     * - ads.txt (AdSense ads.txt)
     * - public folder
     */
    // api/pdf-to-markdown is the Python MarkItDown function; it authenticates itself
    // with an internal secret. The comment above always said it was excluded — the
    // regex never actually listed it, so the middleware 307'd every call to the
    // sign-in page, the server-side fetch followed the redirect, and a multipart POST
    // landing on a PAGE made Next answer "Server action not found". That is the whole
    // story behind "AI retry also failed" on every bill the exact reader could not
    // finish: the AI fallback has never once been reachable in production.
    "/((?!api/auth|api/public|api/v1|api/external|api/whatsapp/webhook|api/telegram|api/razorpay/webhook|api/cashfree/webhook|api/pdf-to-markdown|_next/static|_next/image|favicon|manifest.json|sw.js|icons/|public|api/signup|sitemap.xml|robots.txt|ads.txt|about|how-it-works|pricing|refund|privacy|terms|contact|payment-guide|logo.png|.*\\.(?:html|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
  ],
};
