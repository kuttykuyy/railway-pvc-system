/**
 * The origin that emailed links are built from — password resets, email verification.
 *
 * Never taken from the request. Host and X-Forwarded-Host arrive WITH the request, so a
 * forged one puts an attacker's domain into an email that carries a real, valid token:
 * the recipient sees a link that looks like ours, clicks it, and hands their password
 * reset token to whoever sent the header. That is account takeover, and it needs nothing
 * from the victim beyond opening their own email.
 *
 * NEXTAUTH_URL is consulted but not trusted blindly. Here it names the platform host
 * (irpvc.illall.tech), not the address customers know, so a link built from it would
 * land on a domain where the account does not exist — the same mismatch the sign-out
 * fix had to work around. It is therefore accepted only when it is HTTPS and inside the
 * site's own domain; otherwise the canonical origin is used.
 *
 * Matching is on the parsed hostname, not a substring: "irpvc.in.attacker.com" contains
 * "irpvc.in" and would pass a naive includes() check, which is what the four auth routes
 * were doing before this.
 */

/** Where the site is actually served. The bare domain 308-redirects here. */
export const CANONICAL_ORIGIN = 'https://www.irpvc.in';

const ALLOWED_HOSTS = ['irpvc.in', 'www.irpvc.in'];

function isAllowedHost(hostname: string): boolean {
  return ALLOWED_HOSTS.some(allowed => hostname === allowed || hostname.endsWith(`.${allowed}`));
}

/**
 * The base URL for a link sent by email. Takes no request, on purpose — there is no
 * argument a caller could pass that would make trusting the request safe here.
 */
export function emailLinkOrigin(): string {
  const envUrl = process.env.NEXTAUTH_URL;
  if (!envUrl) return CANONICAL_ORIGIN;

  try {
    const parsed = new URL(envUrl);
    if (parsed.protocol === 'https:' && isAllowedHost(parsed.hostname)) {
      return envUrl.replace(/\/+$/, '');
    }
  } catch {
    // NEXTAUTH_URL is not a URL at all. Fall through to the canonical origin rather
    // than letting a malformed env var decide where a reset link points.
  }

  return CANONICAL_ORIGIN;
}
