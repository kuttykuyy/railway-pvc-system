
'use client';

import { SessionProvider } from 'next-auth/react';
import { Toaster } from 'react-hot-toast';
import { ReactNode } from 'react';
import { LanguageProvider } from './i18n-provider';
import { SiteModeProvider } from './site-mode-provider';
import type { SiteMode } from '@/lib/site-mode';

interface ProvidersProps {
  children: ReactNode;
  siteMode?: SiteMode;
}

export function Providers({ children, siteMode = 'railway' }: ProvidersProps) {
  return (
    // refetchOnWindowFocus off: the default re-validates the session every time the
    // tab regains focus, and pages showing loading states while that settles read as
    // the whole page reloading whenever you switch back.
    <SessionProvider refetchOnWindowFocus={false}>
      <SiteModeProvider mode={siteMode}>
      <LanguageProvider>
        {children}
        <Toaster 
          position="top-right"
          toastOptions={{
            duration: 4000,
            style: {
              background: '#363636',
              color: '#fff',
            },
            success: {
              style: {
                background: '#059669',
              },
            },
            error: {
              style: {
                background: '#DC2626',
              },
            },
          }}
        />
      </LanguageProvider>
      </SiteModeProvider>
    </SessionProvider>
  );
}
