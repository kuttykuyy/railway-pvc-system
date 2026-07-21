'use client';

import { usePathname } from 'next/navigation';
import Script from 'next/script';
import Navigation from '@/components/navigation';
import BottomNavigation from '@/components/mobile/bottom-navigation';
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
        
        {/* Mobile Navigation */}
        <div className="lg:hidden">
          <BottomNavigation />
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
      
      {/* Mobile Navigation */}
      <div className="lg:hidden">
        <BottomNavigation />
      </div>
      
      {/* Main Content */}
      <main className="container mx-auto px-2 sm:px-4 py-4 sm:py-8 max-w-7xl lg:pt-4 pt-2 pb-6 flex-grow">
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
