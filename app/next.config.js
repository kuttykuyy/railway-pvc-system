const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.NEXT_DIST_DIR || '.next',
  output: process.env.NEXT_OUTPUT_MODE,
  productionBrowserSourceMaps: false,
  outputFileTracingRoot: path.join(__dirname, '../'),
  serverExternalPackages: ['@napi-rs/canvas'],
  eslint: {
    ignoreDuringBuilds: false,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  images: { unoptimized: true },
  poweredByHeader: false,
  async headers() {
    // ENFORCED CSP. script-src keeps 'unsafe-inline'/'unsafe-eval' (required by
    // Next.js hydration + AdSense), so no app-critical script is blocked; the value is
    // in blocking UNKNOWN external script/frame/connect origins, plus object-src/base-uri/
    // frame-ancestors. The Google/AdSense + Razorpay allowlists are intentionally broad
    // (missing an ad domain would hide ads; allowing an extra is harmless). If ads or the
    // Razorpay top-up ever misbehave, add the reported origin here — a one-line change.
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://checkout.razorpay.com https://*.razorpay.com https://pagead2.googlesyndication.com https://*.googlesyndication.com https://*.googleadservices.com https://*.googletagservices.com https://*.doubleclick.net https://*.google.com https://*.gstatic.com https://*.googletagmanager.com https://*.google-analytics.com https://*.adtrafficquality.google",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data: https://fonts.gstatic.com",
      // Supabase storage is here because JPC sheets upload straight from the browser to
      // the bucket (signed URL), skipping Vercel's 4.5 MB request cap. Without this
      // entry the browser killed every such upload before it left — no network entry,
      // no console error in production, just "Failed to fetch" — which spent a long day
      // being misread as credentials, bucket names, checksums, and CORS in turn.
      "connect-src 'self' https://*.supabase.co https://*.storage.supabase.co https://*.razorpay.com https://*.google.com https://*.googlesyndication.com https://*.googleadservices.com https://*.googletagservices.com https://*.doubleclick.net https://*.google-analytics.com https://*.googletagmanager.com https://*.adtrafficquality.google https://pagead2.googlesyndication.com",
      "frame-src https://*.razorpay.com https://*.google.com https://*.doubleclick.net https://*.googlesyndication.com https://*.googleadservices.com",
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
    ].join('; ');

    const securityHeaders = [
      { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      { key: 'Content-Security-Policy', value: csp },
    ];
    return [{ source: '/:path*', headers: securityHeaders }];
  },
  webpack: (config, { isServer }) => {
    config.resolve.alias.canvas = false;
    if (!isServer) {
      config.output.filename = 'static/chunks/[name]-[contenthash:8].js';
      config.output.chunkFilename = 'static/chunks/[contenthash:16].js';
    }
    return config;
  },
};

module.exports = nextConfig;
