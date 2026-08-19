import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CANONICAL_ORIGIN, emailLinkOrigin } from './email-link-origin';

/**
 * These links carry password-reset and email-verification tokens. Before this, four auth
 * routes fell back to the request's own X-Forwarded-Host whenever NEXTAUTH_URL did not
 * contain "irpvc.in" — which is always, because NEXTAUTH_URL names the platform host.
 * A forged header therefore chose the domain in an email holding a real, valid token.
 */
describe('emailLinkOrigin', () => {
  const original = process.env.NEXTAUTH_URL;

  beforeEach(() => { delete process.env.NEXTAUTH_URL; });
  afterEach(() => {
    if (original === undefined) delete process.env.NEXTAUTH_URL;
    else process.env.NEXTAUTH_URL = original;
  });

  it('falls back to the canonical origin when NEXTAUTH_URL is unset', () => {
    expect(emailLinkOrigin()).toBe(CANONICAL_ORIGIN);
  });

  it('accepts NEXTAUTH_URL when it is https and inside the site domain', () => {
    process.env.NEXTAUTH_URL = 'https://www.irpvc.in';
    expect(emailLinkOrigin()).toBe('https://www.irpvc.in');
    process.env.NEXTAUTH_URL = 'https://irpvc.in';
    expect(emailLinkOrigin()).toBe('https://irpvc.in');
  });

  it('rejects the platform host, which is what NEXTAUTH_URL actually holds here', () => {
    // The reason the old includes('irpvc.in') check never matched, sending every route
    // down its header-trusting fallback.
    process.env.NEXTAUTH_URL = 'https://irpvc.illall.tech';
    expect(emailLinkOrigin()).toBe(CANONICAL_ORIGIN);
  });

  it('rejects a lookalike domain that merely contains the site name', () => {
    // "irpvc.in.attacker.com".includes("irpvc.in") is true — the old check would have
    // accepted it. Matching is on the parsed hostname instead.
    process.env.NEXTAUTH_URL = 'https://irpvc.in.attacker.com';
    expect(emailLinkOrigin()).toBe(CANONICAL_ORIGIN);
  });

  it('rejects a plain-http origin even on the right domain', () => {
    process.env.NEXTAUTH_URL = 'http://www.irpvc.in';
    expect(emailLinkOrigin()).toBe(CANONICAL_ORIGIN);
  });

  it('accepts a subdomain of the site', () => {
    process.env.NEXTAUTH_URL = 'https://staging.irpvc.in';
    expect(emailLinkOrigin()).toBe('https://staging.irpvc.in');
  });

  it('falls back rather than letting a malformed NEXTAUTH_URL decide', () => {
    process.env.NEXTAUTH_URL = 'not a url';
    expect(emailLinkOrigin()).toBe(CANONICAL_ORIGIN);
  });

  it('strips trailing slashes so the joined path has exactly one', () => {
    process.env.NEXTAUTH_URL = 'https://www.irpvc.in///';
    expect(emailLinkOrigin()).toBe('https://www.irpvc.in');
  });
});
