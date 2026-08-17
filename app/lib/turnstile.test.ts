import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { verifyTurnstileToken, isTurnstileConfigured } from './turnstile';

/**
 * The gate on signup. Its failure modes matter more than its success one: a check that
 * wrongly refuses closes the front door, and one that wrongly allows is not a check.
 */
describe('verifyTurnstileToken', () => {
  const originalSecret = process.env.TURNSTILE_SECRET_KEY;

  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.TURNSTILE_SECRET_KEY;
    else process.env.TURNSTILE_SECRET_KEY = originalSecret;
    vi.restoreAllMocks();
  });

  it('lets the signup through when no secret is configured, and says it did not enforce', async () => {
    delete process.env.TURNSTILE_SECRET_KEY;
    const result = await verifyTurnstileToken('anything');
    expect(result.ok).toBe(true);
    expect(result.enforced).toBe(false);
  });

  it('refuses a missing token once a secret is configured', async () => {
    process.env.TURNSTILE_SECRET_KEY = 'secret';
    const result = await verifyTurnstileToken(undefined);
    expect(result.ok).toBe(false);
    expect(result.enforced).toBe(true);
    expect(result.reason).toMatch(/human/i);
  });

  it('accepts a token Cloudflare confirms', async () => {
    process.env.TURNSTILE_SECRET_KEY = 'secret';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: async () => ({ success: true }),
    }));
    const result = await verifyTurnstileToken('good-token');
    expect(result).toEqual({ ok: true, enforced: true });
  });

  it('refuses a token Cloudflare rejects', async () => {
    process.env.TURNSTILE_SECRET_KEY = 'secret';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: async () => ({ success: false, 'error-codes': ['invalid-input-response'] }),
    }));
    const result = await verifyTurnstileToken('bad-token');
    expect(result.ok).toBe(false);
    expect(result.enforced).toBe(true);
  });

  it('tells the user to take the check again when the token was already spent', async () => {
    process.env.TURNSTILE_SECRET_KEY = 'secret';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: async () => ({ success: false, 'error-codes': ['timeout-or-duplicate'] }),
    }));
    const result = await verifyTurnstileToken('stale-token');
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/expired/i);
  });

  it('lets the signup through when Cloudflare cannot be reached', async () => {
    // An outage on their side must not become a closed front door on ours; the IP
    // rate limit still applies underneath.
    process.env.TURNSTILE_SECRET_KEY = 'secret';
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    const result = await verifyTurnstileToken('token');
    expect(result.ok).toBe(true);
    expect(result.enforced).toBe(false);
  });

  it('passes the caller IP to Cloudflare, but not the "unknown" placeholder', async () => {
    process.env.TURNSTILE_SECRET_KEY = 'secret';
    const fetchMock = vi.fn().mockResolvedValue({ json: async () => ({ success: true }) });
    vi.stubGlobal('fetch', fetchMock);

    await verifyTurnstileToken('token', '203.0.113.7');
    expect((fetchMock.mock.calls[0][1].body as URLSearchParams).get('remoteip')).toBe('203.0.113.7');

    await verifyTurnstileToken('token', 'unknown');
    expect((fetchMock.mock.calls[1][1].body as URLSearchParams).get('remoteip')).toBeNull();
  });

  it('reports whether a secret is configured', () => {
    process.env.TURNSTILE_SECRET_KEY = 'secret';
    expect(isTurnstileConfigured()).toBe(true);
    delete process.env.TURNSTILE_SECRET_KEY;
    expect(isTurnstileConfigured()).toBe(false);
  });
});
