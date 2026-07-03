const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.NEXT_DIST_DIR || '.next',
  output: process.env.NEXT_OUTPUT_MODE,
  productionBrowserSourceMaps: false,
  outputFileTracingRoot: path.join(__dirname, '../'),
  eslint: {
    ignoreDuringBuilds: false,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  images: { unoptimized: true },
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
  poweredByHeader: false,
  async headers() {
    // ENFORCED CSP: only restricts framing/objects/base-uri (does not touch
    // script/style/connect), so it cannot break Razorpay/Google/AdSense.
    const enforcedCsp = "frame-ancestors 'none'; object-src 'none'; base-uri 'self'";

    // FULL CSP in Report-Only mode: blocks nothing (zero breakage risk) but reports
    // what a strict script-src policy would break. The app loads Razorpay checkout,
    // Google AdSense (many dynamic ad domains), and inline scripts, so this must be
    // validated against real ad/checkout/login traffic (watch the browser console for
    // "Report Only" CSP violations) BEFORE promoting it to an enforced policy — at which
    // point, change the header key below from ...-Report-Only to Content-Security-Policy.
    const fullCspReportOnly = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://checkout.razorpay.com https://*.razorpay.com https://pagead2.googlesyndication.com https://*.googlesyndication.com https://*.googleadservices.com https://*.doubleclick.net https://*.google.com https://*.gstatic.com https://*.googletagmanager.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data: https://fonts.gstatic.com",
      "connect-src 'self' https://*.razorpay.com https://*.google.com https://*.googlesyndication.com https://*.doubleclick.net https://*.googleadservices.com https://*.google-analytics.com https://pagead2.googlesyndication.com",
      "frame-src https://*.razorpay.com https://*.google.com https://*.doubleclick.net https://*.googlesyndication.com",
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
      { key: 'Content-Security-Policy', value: enforcedCsp },
      { key: 'Content-Security-Policy-Report-Only', value: fullCspReportOnly },
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
