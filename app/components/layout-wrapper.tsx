'use client';

import { usePathname } from 'next/navigation';
import Script from 'next/script';
import Link from 'next/link';
import Navigation from '@/components/navigation';
import MobileNavigation from '@/components/mobile/mobile-navigation';
import InstallPrompt from '@/components/pwa/install-prompt';
import PushNotifications from '@/components/pwa/push-notifications';
import OfflineIndicator from '@/components/mobile/offline-indicator';
import ServiceWorkerUpdate from '@/components/service-worker-update';

// Pages with substantial original content where ads are appropriate.
// Excludes auth forms, legal boilerplate (privacy/terms/refund), and the
// logged-in app (dashboard, bills, contracts, etc.) which AdSense flags
// as "low value content" when ads are shown there.
const AD_ELIGIBLE_PAGES = ['/', '/about', '/pricing', '/help', '/getting-started', '/contact'];

export default function LayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isPublicPage = pathname === '/' ||
    pathname?.startsWith('/auth/') ||
    pathname === '/about' ||
    pathname === '/pricing' ||
    pathname === '/privacy' ||
    pathname === '/terms' ||
    pathname === '/refund' ||
    pathname === '/contact' ||
    pathname === '/payment-guide' ||
    pathname === '/help';

  const showAds = AD_ELIGIBLE_PAGES.includes(pathname || '');

  // First-run onboarding: no navigation, nothing to click away to. Just the logo
  // and the two uploads, so a brand-new user does one thing at a time.
  if (pathname === '/welcome') {
    return (
      <div className="min-h-screen bg-white flex flex-col w-full overflow-x-hidden">
        <header className="border-b border-slate-100">
          <div className="max-w-2xl mx-auto px-4 sm:px-6 h-14 flex items-center">
            <Link href="/" className="flex items-center gap-2">
              <img src="/logo.png" alt="IR-PVC" className="h-8 w-auto object-contain" />
              <span className="font-extrabold tracking-tight text-emerald-800">IR-PVC</span>
            </Link>
          </div>
        </header>
        <main className="flex-grow w-full">{children}</main>
        <InstallPrompt />
        <PushNotifications />
        <OfflineIndicator />
        <ServiceWorkerUpdate />
      </div>
    );
  }

  const adsenseScript = showAds ? (
    <Script
      async
      src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-6836761436784639"
      crossOrigin="anonymous"
      strategy="afterInteractive"
    />
  ) : null;

  if (isPublicPage) {
    return (
      <div className="min-h-screen bg-white flex flex-col w-full overflow-x-hidden">
        {adsenseScript}
        {/* Desktop Navigation */}
        <div className="hidden lg:block">
          <Navigation />
        </div>
        
        {/* Mobile Navigation — top bar with a hamburger opening the left drawer */}
        <div className="lg:hidden">
          <MobileNavigation />
        </div>
        
        {/* Main Content - No max-w-7xl, no padding around it, completely full-width */}
        <main className="flex-grow w-full">
          {children}
        </main>
        
        {/* PWA Components */}
        <InstallPrompt />
        <PushNotifications />
        <OfflineIndicator />
        <ServiceWorkerUpdate />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-emerald-50 to-emerald-50 flex flex-col w-full overflow-x-hidden">
      {/* Desktop Navigation */}
      <div className="hidden lg:block">
        <Navigation />
      </div>
      
      {/* Mobile Navigation — top bar with a hamburger opening the left drawer */}
      <div className="lg:hidden">
        <MobileNavigation />
      </div>
      
      {/* Main Content — full width, with just a small side gutter so content
          is never glued to the screen edge. */}
      <main className="px-3 sm:px-6 py-4 sm:py-8 lg:pt-4 pt-2 pb-6 flex-grow w-full min-w-0 overflow-x-clip">
        {children}
      </main>
      
      {/* PWA Components */}
      <InstallPrompt />
      <PushNotifications />
      <OfflineIndicator />
      <ServiceWorkerUpdate />
    </div>
  );
}
