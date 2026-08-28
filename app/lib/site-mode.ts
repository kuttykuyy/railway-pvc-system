/**
 * Which "face" of the app a request is being served as, from its hostname.
 *
 * The same deployment serves both irpvc.in (Railway) and cpwd.irpvc.in (CPWD). One
 * codebase, one database, one login — the host just decides which scheme leads: on the
 * CPWD host new contracts default to CPWD 10CA and the lists open on the CPWD view, while
 * irpvc.in stays Railway-first. Everything else is shared.
 */

export type SiteMode = 'railway' | 'cpwd';

/** 'cpwd' when the host is the CPWD subdomain (cpwd.irpvc.in, or any cpwd.* / *cpwd* host). */
export function siteModeFromHost(host?: string | null): SiteMode {
  const h = String(host ?? '').trim().toLowerCase();
  // Match the cpwd subdomain label specifically, so "irpvc.in" is never mistaken for it.
  return /(^|\.)cpwd\./.test(h) || h.startsWith('cpwd.') ? 'cpwd' : 'railway';
}
