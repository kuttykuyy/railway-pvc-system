/**
 * Cloudflare Turnstile — proof that a human filled the form.
 *
 * Signup was rate-limited per IP but not gated, and every new account carries a free
 * bill and free AI extraction. The rate limit caps how fast one address can register;
 * it does nothing about a script spread across many, which is what makes automated
 * signup worth someone's while here.
 *
 * Deliberately fails OPEN when TURNSTILE_SECRET_KEY is unset, so that deploying this
 * does not lock everyone out of signup before the keys are added in Vercel. That means
 * it protects nothing until configured — the warning below is the only sign, so it is
 * logged loudly on every unverified signup rather than once at startup.
 */

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export interface TurnstileResult {
  /** Whether the signup may proceed. True when verification passed OR is not configured. */
  ok: boolean;
  /** Set when ok is false — safe to show the person. */
  reason?: string;
  /** True when the check was actually performed, as opposed to skipped. */
  enforced: boolean;
}

/** Whether a secret is configured. Server-side only. */
export function isTurnstileConfigured(): boolean {
  return Boolean(process.env.TURNSTILE_SECRET_KEY);
}

export async function verifyTurnstileToken(
  token: string | undefined | null,
  remoteIp?: string,
): Promise<TurnstileResult> {
  const secret = process.env.TURNSTILE_SECRET_KEY;

  if (!secret) {
    console.warn(
      '[turnstile] TURNSTILE_SECRET_KEY is not set — signup is NOT protected against '
      + 'automated accounts. Set it in the Vercel environment to switch the check on.',
    );
    return { ok: true, enforced: false };
  }

  if (!token) {
    return {
      ok: false,
      enforced: true,
      reason: 'Please complete the "I am human" check and try again.',
    };
  }

  const body = new URLSearchParams({ secret, response: token });
  // Cloudflare accepts the caller's IP as a corroborating signal. It is optional, and
  // behind Vercel it is the forwarded address, so a bad value must not fail the check.
  if (remoteIp && remoteIp !== 'unknown') body.set('remoteip', remoteIp);

  try {
    // Never let a slow or unreachable Cloudflare hold a signup open indefinitely.
    const response = await fetch(VERIFY_URL, {
      method: 'POST',
      body,
      signal: AbortSignal.timeout(10_000),
    });
    const outcome = (await response.json()) as {
      success?: boolean;
      'error-codes'?: string[];
    };

    if (outcome?.success) return { ok: true, enforced: true };

    const codes = outcome?.['error-codes'] || [];
    console.warn(`[turnstile] verification failed: ${codes.join(', ') || 'no reason given'}`);

    // A token is single-use and short-lived, so the common failures are a resubmitted
    // form or one left open too long. Both are fixed by taking the check again.
    const staleToken = codes.includes('timeout-or-duplicate');
    return {
      ok: false,
      enforced: true,
      reason: staleToken
        ? 'That check has expired. Please complete it again and resubmit.'
        : 'We could not confirm you are human. Please try the check again.',
    };
  } catch (error) {
    // Cloudflare being unreachable is our problem, not the customer's. Let the signup
    // through rather than turning an outage on their side into a closed front door;
    // the IP rate limit still applies underneath.
    console.error('[turnstile] could not reach Cloudflare, allowing the signup:', error);
    return { ok: true, enforced: false };
  }
}
