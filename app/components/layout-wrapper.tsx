'use client';

import { usePathname } from 'next/navigation';
import Navigation from '@/components/navigation';
import MobileNavigation from '@/components/mobile/mobile-navigation';
import InstallPrompt from '@/components/pwa/install-prompt';
import PushNotifications from '@/components/pwa/push-notifications';
import OfflineIndicator from '@/components/mobile/offline-indicator';
import ServiceWorkerUpdate from '@/components/service-worker-update';

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
    pathname === '/help';

  if (isPublicPage) {
    return (
      <div className="min-h-screen bg-white flex flex-col w-full overflow-x-hidden">
        {/* Desktop Navigation */}
        <div className="hidden lg:block">
          <Navigation />
        </div>
        
        {/* Mobile Navigation */}
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
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-blue-50 to-cyan-50 flex flex-col w-full overflow-x-hidden">
      {/* Desktop Navigation */}
      <div className="hidden lg:block">
        <Navigation />
      </div>
      
      {/* Mobile Navigation */}
      <div className="lg:hidden">
        <MobileNavigation />
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
