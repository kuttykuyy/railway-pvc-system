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
    // Safe, non-breaking security headers (SA-02). The CSP here only restricts
    // framing/objects/base-uri (does not touch script/style/connect), so it cannot
    // break Razorpay/Google/analytics. A full script-src CSP can be added after
    // testing those third-party origins.
    const securityHeaders = [
      { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      { key: 'Content-Security-Policy', value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'" },
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
