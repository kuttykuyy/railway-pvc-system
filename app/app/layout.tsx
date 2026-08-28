

import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';
import { ThemeProvider } from '@/components/theme-provider';
import { Providers } from '@/components/providers';
import ErrorBoundary from '@/components/error-boundary';
import ChunkErrorHandler from '@/components/chunk-error-handler';
import { SessionTimeoutWarning } from '@/components/session-timeout-warning';
import StructuredData from '@/components/structured-data';
import { headers } from 'next/headers';
import { siteModeFromHost } from '@/lib/site-mode';
import LayoutWrapper from '@/components/layout-wrapper';
import Script from 'next/script';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  preload: true,
  variable: '--font-inter',
});

export const metadata: Metadata = {
  // www: the bare domain 307-redirects here, so canonical and Open Graph URLs built
  // from this base must name the address that actually serves the page.
  metadataBase: new URL('https://www.irpvc.in'),
  // Every page declares itself canonical at its own path, which is what settles
  // Search Console's "Duplicate without user-selected canonical": Google had two
  // addresses for one page and nothing from us saying which to keep.
  alternates: { canonical: './' },
  title: {
    default: 'IR-PVC - Indian Railway Price Variation Clause Calculator | irpvc.in',
    template: '%s | IR-PVC'
  },
  description: 'Complete PVC (Price Variation Clause) calculation system for Indian Railway contracts. Automate bill generation, track price indices, manage contracts, and generate compliant reports as per GCC norms. Trusted by railway contractors across India.',
  keywords: [
    'Indian Railway PVC Calculator',
    'Price Variation Clause India',
    'Railway Contract Management System',
    'PVC Calculation Software',
    'Railway Bill Generation Tool',
    'GCC Compliance India',
    'Railway Price Indices Tracker',
    'Contract Price Adjustment Calculator',
    'Railway Contractor Software',
    'IR-PVC System',
    'Railway PVC Reports Generator',
    'Construction Price Variation India',
    'Railway Civil Works Management',
    'Automated PVC Calculator',
    'Railway Tender Management',
    'Indian Railway Billing Software'
  ],
  authors: [{ name: 'Southern Railway Contractors Association - Tiruchirappalli Division' }],
  creator: 'Southern Railway Contractors Association - Tiruchirappalli Division',
  publisher: 'Southern Railway Contractors Association - Tiruchirappalli Division',
  applicationName: 'IR-PVC',
  category: 'Business Software',
  classification: 'Railway Contract Management',
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  openGraph: {
    type: 'website',
    locale: 'en_IN',
    url: 'https://irpvc.in',
    title: 'IR-PVC - Indian Railway Price Variation Clause Calculator',
    description: 'Automate PVC calculations for Indian Railway contracts. Manage bills, track indices, and generate GCC-compliant reports. Trusted by railway contractors across India.',
    siteName: 'IR-PVC',
    images: [
      {
        url: 'https://irpvc.in/icons/icon-512x512.png',
        width: 512,
        height: 512,
        alt: 'IR-PVC - Railway PVC Calculator System',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'IR-PVC - Indian Railway Price Variation Clause Calculator',
    description: 'Automate PVC calculations for Indian Railway contracts. Manage bills, track indices, and generate GCC-compliant reports.',
    images: ['https://irpvc.in/icons/icon-512x512.png'],
    creator: '@irpvc',
    site: '@irpvc',
  },
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'IR-PVC',
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: '/favicon.png', type: 'image/png' },
      { url: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512x512.png', sizes: '512x512', type: 'image/png' },
    ],
    shortcut: '/favicon.png',
    apple: [
      { url: '/icons/icon-152x152.png', sizes: '152x152', type: 'image/png' },
      { url: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png' },
    ],
  },
  verification: {
    google: process.env.GOOGLE_SITE_VERIFICATION || 'google-site-verification-code-here', // Add your verification code from Google Search Console
  },
  other: {
    'mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-status-bar-style': 'default',
    'apple-mobile-web-app-title': 'Railway PVC',
    'application-name': 'Railway PVC',
    'msapplication-TileColor': '#059669',
    'msapplication-TileImage': '/icons/icon-144x144.png',
    'theme-color': '#059669',
  },
};

export const viewport: Viewport = {
  themeColor: '#059669',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: 'cover',
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // The CPWD subdomain (cpwd.irpvc.in) serves the same app in CPWD mode.
  const siteMode = siteModeFromHost((await headers()).get('host'));
  return (
    <html lang="en">
      <head>
        <Script id="console-error-filter" strategy="beforeInteractive">
          {`(function(){var o=console.error;console.error=function(){var a=[].slice.call(arguments).join(' ');if(a.indexOf('CLIENT_FETCH_ERROR')!==-1||a.indexOf('next-auth')!==-1&&a.indexOf('error')!==-1)return;o.apply(console,arguments)};})();`}
        </Script>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#059669" />
        <link rel="apple-touch-icon" href="/icons/icon-192x192.png" />
        <StructuredData />
      </head>
      <body className={inter.className}>
        <ErrorBoundary>
          <Providers siteMode={siteMode}>
            <ThemeProvider
              attribute="class"
              defaultTheme="light"
              enableSystem
              disableTransitionOnChange
            >
              <ChunkErrorHandler />
              <SessionTimeoutWarning />
              <LayoutWrapper>
                {children}
              </LayoutWrapper>
              <Toaster />
            </ThemeProvider>
          </Providers>
        </ErrorBoundary>
        
        {/* Service Worker Registration */}
        <Script id="service-worker-registration" strategy="afterInteractive">
          {`
            if (typeof window !== 'undefined' && 'serviceWorker' in navigator && typeof navigator.serviceWorker.register === 'function') {
              window.addEventListener('load', function() {
                try {
                  // Only register if we're not in test mode and on specific domains
                  var allowedDomains = ['irpvc.in'];
                  var isAllowedDomain = allowedDomains.some(function(domain) {
                    return window.location.hostname === domain;
                  });
                  var isSecure = window.location.protocol === 'https:' || window.location.hostname === 'localhost';

                  if (!window.__NEXT_TEST_MODE && isAllowedDomain && isSecure) {
                    navigator.serviceWorker.register('/sw.js', {
                      scope: '/'
                    })
                    .then(function(registration) {
                      // Service worker registered successfully
                    })
                    .catch(function(registrationError) {
                      // Service worker registration failed
                    });
                  }
                } catch (error) {
                  // Silently handle errors
                }
              });
            }
          `}
        </Script>
      </body>
    </html>
  );
}