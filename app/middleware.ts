import { getToken } from "next-auth/jwt";
import { NextRequest, NextResponse } from "next/server";

export async function middleware(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl;

  // Redirect old PVC Comparison URLs to new Class Analyzer URLs
  if (pathname.startsWith('/pvc-comparison')) {
    const newUrl = new URL(req.url);
    newUrl.pathname = pathname.replace('/pvc-comparison', '/class-analyzer');
    return NextResponse.redirect(newUrl);
  }
  
  if (pathname.startsWith('/api/pvc-comparison')) {
    const newUrl = new URL(req.url);
    newUrl.pathname = pathname.replace('/api/pvc-comparison', '/api/class-analyzer');
    return NextResponse.redirect(newUrl);
  }

  // Allow public access to PDF reports with valid token
  if (pathname.match(/^\/api\/bills\/[^\/]+\/pdf-report$/) && 
      searchParams.get('public_access') === 'true' && 
      searchParams.get('token')) {
    return NextResponse.next();
  }

  // Allow access to auth pages and API routes without token
  if (pathname.startsWith('/auth/') || 
      pathname.startsWith('/api/auth/') ||
      pathname.startsWith('/api/signup') ||
      pathname.startsWith('/api/public/') ||
      pathname.startsWith('/api/health/') ||
      pathname.startsWith('/api/whatsapp/webhook') ||
      pathname.startsWith('/api/razorpay/webhook') ||
      pathname.startsWith('/api/external/')) {
    return NextResponse.next();
  }

  // Allow public policy and info pages
  if (pathname.startsWith('/terms') || 
      pathname.startsWith('/privacy') ||
      pathname.startsWith('/refund') ||
      pathname.startsWith('/contact') ||
      pathname.startsWith('/payment-guide') ||
      pathname.startsWith('/about') ||
      pathname.startsWith('/pricing')) {
    return NextResponse.next();
  }

  // Allow public assets and PWA files
  if (pathname.startsWith('/_next/') || 
      pathname.startsWith('/favicon') ||
      pathname === '/manifest.json' ||
      pathname === '/sw.js' ||
      pathname.startsWith('/icons/') ||
      pathname === '/') {
    return NextResponse.next();
  }

  // Allow SEO files (sitemap, robots.txt)
  if (pathname === '/sitemap.xml' || 
      pathname === '/robots.txt') {
    return NextResponse.next();
  }

  // Allow public image files
  if (pathname.match(/\.(png|jpg|jpeg|gif|svg|ico|webp)$/i)) {
    return NextResponse.next();
  }

  // Check token for protected routes
  const token = await getToken({ 
    req, 
    secret: process.env.NEXTAUTH_SECRET || 'Fi0MOZYHoOhJbC1I7POU3RgAgLAseMsL'
  });

  if (!token) {
    const signInUrl = new URL('/auth/signin', req.url);
    signInUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(signInUrl);
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
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - manifest.json (PWA manifest)
     * - sw.js (service worker)
     * - icons/ (PWA icons)
     * - sitemap.xml (SEO sitemap)
     * - robots.txt (SEO robots file)
     * - public folder
     */
    "/((?!api/auth|api/public|api/v1|api/external|api/whatsapp/webhook|api/telegram|api/razorpay/webhook|_next/static|_next/image|favicon|manifest.json|sw.js|icons/|public|api/signup|sitemap.xml|robots.txt).*)",
  ],
};
