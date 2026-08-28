'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { SiteMode } from '@/lib/site-mode';

/**
 * Exposes the site mode (railway vs cpwd) to the client tree. The mode is resolved on the
 * server from the request host and passed in, so there is no railway→cpwd flash on the
 * CPWD subdomain.
 */
const SiteModeContext = createContext<SiteMode>('railway');

export function SiteModeProvider({ mode, children }: { mode: SiteMode; children: ReactNode }) {
  return <SiteModeContext.Provider value={mode}>{children}</SiteModeContext.Provider>;
}

/** 'railway' | 'cpwd' — which face of the app this is. */
export function useSiteMode(): SiteMode {
  return useContext(SiteModeContext);
}
