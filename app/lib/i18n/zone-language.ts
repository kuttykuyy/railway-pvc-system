import type { Language } from './translations';

/**
 * The default UI language for a contract, from its railway zone or CPWD region.
 *
 * The app has two languages, English and Hindi, so this is a Hindi-belt vs not decision:
 * zones headquartered in Hindi-speaking states default to Hindi, every other zone (the
 * South, Bengal/East, the West, and the North-East, whose own languages the app does not
 * carry) defaults to English. It is only a DEFAULT — an explicit language choice by the
 * user always wins (see the provider's setLanguageAuto).
 */

/** Zones defaulting to Hindi — the Hindi heartland (UP, Bihar, Rajasthan, MP, Chhattisgarh,
 *  Delhi) plus Central (CR) and Western (WR), where Hindi is the common working language. */
const HINDI_ZONES = new Set(['NR', 'NCR', 'NER', 'NWR', 'WCR', 'ECR', 'SECR', 'CR', 'WR']);

/** CPWD regions whose city is Hindi-speaking. */
const HINDI_CPWD_REGIONS = new Set([
  'delhi-ncr', 'delhi', 'lucknow', 'kanpur', 'allahabad', 'prayagraj',
  'jaipur', 'patna', 'bhopal', 'raipur', 'ranchi', 'dehradun', 'chandigarh',
]);

export function defaultLanguageForZone(zone?: string | null): Language {
  return zone && HINDI_ZONES.has(String(zone).trim().toUpperCase()) ? 'hi' : 'en';
}

export function defaultLanguageForCpwdRegion(region?: string | null): Language {
  return HINDI_CPWD_REGIONS.has(String(region ?? '').trim().toLowerCase()) ? 'hi' : 'en';
}
