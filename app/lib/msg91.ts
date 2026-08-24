import { prisma } from './db';
import { logger } from './logger';
import { normalizePhone } from './phone-validation';

/**
 * Sending a verification code by SMS, through MSG91.
 *
 * WhatsApp is the first channel and this is the second. It exists because the first one
 * failed in the worst possible way: the 'otp_verification' template did not exist at the
 * provider, every code request was refused, and since the sign-up form will not submit
 * an unverified number, nobody could create an account at all. One channel is one point
 * of failure standing between a new customer and the product.
 *
 * MSG91's FLOW api, not their OTP api, on purpose. They offer to generate, store and
 * verify the code themselves — but this app already does all of that, with its own
 * cooldown, its five-an-hour cap, its three-attempt limit and its expiry, and those
 * rules are enforced in one place today. Handing the code to a second system would make
 * two sources of truth about whether a number is verified. So MSG91 is asked only to
 * DELIVER a code this app generated.
 *
 * A note on Indian SMS: the template must be registered on DLT and approved before a
 * single message is delivered. Getting the credentials is not the same as being able to
 * send, which is exactly the mistake that took WhatsApp down.
 */

const API_URL = 'https://control.msg91.com/api/v5/flow/';

export interface Msg91Config {
  authKey: string;
  templateId: string;
  /** The variable name in the DLT/flow template that carries the code. */
  otpVariable: string;
}

/**
 * Settings first, environment second.
 *
 * Settings so the provider can be changed without a deploy — the same reasoning as the
 * WhatsApp credentials, which live there. Environment as a fallback so it can be set up
 * before any admin screen exists for it.
 */
export async function getMsg91Config(): Promise<Msg91Config | null> {
  let authKey = process.env.MSG91_AUTH_KEY || '';
  let templateId = process.env.MSG91_TEMPLATE_ID || '';
  let otpVariable = process.env.MSG91_OTP_VARIABLE || '';

  try {
    const rows = await prisma.adminSettings.findMany({
      where: { key: { in: ['msg91_auth_key', 'msg91_template_id', 'msg91_otp_variable'] } },
      select: { key: true, value: true },
    });
    for (const row of rows) {
      const value = String(row.value || '').trim();
      if (!value) continue;
      if (row.key === 'msg91_auth_key') authKey = value;
      if (row.key === 'msg91_template_id') templateId = value;
      if (row.key === 'msg91_otp_variable') otpVariable = value;
    }
  } catch (error) {
    // Unreadable settings must not disable a channel that the environment can supply.
    logger.warn('[msg91] could not read settings, using environment only:', error);
  }

  if (!authKey.trim() || !templateId.trim()) return null;
  // MSG91 flow templates name their own variables; "otp" is the usual one.
  return { authKey: authKey.trim(), templateId: templateId.trim(), otpVariable: otpVariable.trim() || 'otp' };
}

export async function isMsg91Configured(): Promise<boolean> {
  return (await getMsg91Config()) !== null;
}

/**
 * MSG91 wants digits with the country code and no plus: 919876543210.
 *
 * Built from the normalised form rather than the raw input, so a number typed as ten
 * digits and one typed as +91… reach the provider identically.
 */
export function toMsg91Mobile(phone: string): string | null {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;
  return normalized.replace(/\D/g, '');
}

/** The request body, kept separate so it can be checked without sending anything. */
export function buildMsg91Payload(config: Msg91Config, mobile: string, code: string) {
  return {
    template_id: config.templateId,
    short_url: '0',
    // Ask for the real outcome in the response instead of an accepted-for-processing
    // acknowledgement. A queued message that is later refused, reported as success, is
    // how somebody ends up waiting for a code that was never going to arrive.
    realTimeResponse: '1',
    recipients: [{ mobiles: mobile, [config.otpVariable]: code }],
  };
}

/**
 * What MSG91 actually said. Their API answers 200 with a body that carries the verdict,
 * so the status code alone proves nothing.
 */
export function readMsg91Response(body: unknown): { ok: boolean; detail: string } {
  const data = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const type = String(data.type ?? '').toLowerCase();
  const message = typeof data.message === 'string' ? data.message : JSON.stringify(data).slice(0, 300);
  if (type === 'success') return { ok: true, detail: message };
  if (type === 'error') return { ok: false, detail: message || 'MSG91 reported an error' };
  // Neither word present: treat as a failure and quote what came back, rather than
  // assuming success from a shape nobody recognises.
  return { ok: false, detail: `Unexpected reply from MSG91: ${message}` };
}

/**
 * Deliver a code. Never throws — the caller is already handling a failure path.
 */
export async function sendOtpSms(
  phone: string,
  code: string,
): Promise<{ success: boolean; error?: string; messageId?: string }> {
  const config = await getMsg91Config();
  if (!config) return { success: false, error: 'MSG91 is not configured' };

  const mobile = toMsg91Mobile(phone);
  if (!mobile) return { success: false, error: `Not a usable mobile number: ${phone}` };

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        authkey: config.authKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(buildMsg91Payload(config, mobile, code)),
    });

    // Read once as text: a gateway refusal is not JSON, and parsing it as JSON throws
    // the explanation away.
    const raw = await response.text().catch(() => '');
    let parsed: unknown = {};
    try { parsed = raw ? JSON.parse(raw) : {}; } catch { parsed = {}; }

    if (!response.ok) {
      const detail = raw.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
      return { success: false, error: `MSG91 returned ${response.status}: ${detail}` };
    }

    const verdict = readMsg91Response(parsed);
    if (!verdict.ok) return { success: false, error: verdict.detail };

    logger.log('[msg91] code sent to', mobile);
    return { success: true, messageId: verdict.detail };
  } catch (error: any) {
    return { success: false, error: error?.message || 'MSG91 request failed' };
  }
}

/** For the admin diagnostic: what is set, never the values. */
export async function getMsg91Diagnostics() {
  const config = await getMsg91Config();
  return {
    configured: !!config,
    authKeySet: !!config?.authKey,
    templateIdSet: !!config?.templateId,
    otpVariable: config?.otpVariable ?? null,
    note: config
      ? 'Configured. Credentials alone do not prove delivery — the DLT template must also be approved.'
      : 'Set msg91_auth_key and msg91_template_id in admin settings, or MSG91_AUTH_KEY and MSG91_TEMPLATE_ID in the environment.',
  };
}
