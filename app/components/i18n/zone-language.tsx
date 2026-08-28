'use client';

import { useEffect } from 'react';
import { useLanguage } from '@/components/i18n-provider';
import { defaultLanguageForZone, defaultLanguageForCpwdRegion } from '@/lib/i18n/zone-language';

/**
 * Renders nothing; sets the UI language from the contract's zone / CPWD region as a default
 * — a Hindi-belt contract shows Hindi, others English — without overriding a language the
 * user has explicitly chosen. Drop it on a page where the contract's zone is known.
 */
export function ZoneLanguage({ zone, cpwdRegion }: { zone?: string | null; cpwdRegion?: string | null }) {
  const { setLanguageAuto } = useLanguage();
  useEffect(() => {
    setLanguageAuto(cpwdRegion ? defaultLanguageForCpwdRegion(cpwdRegion) : defaultLanguageForZone(zone));
  }, [zone, cpwdRegion, setLanguageAuto]);
  return null;
}
