import crypto from 'crypto';
import { prisma } from './db';
import { logger } from './logger';

/**
 * Cashfree Payments, as a second gateway beside Razorpay.
 *
 * One gateway is live at a time — see lib/payment-gateway.ts — so this is not a second
 * checkout button but a switch an admin can throw. Razorpay's own history stays in
 * razorpay_transactions and is never written here.
 *
 * The rule that governs everything below: MONEY IS ONLY WHAT CASHFREE SAYS IT IS. The
 * browser is told the outcome so it can show a message, and nothing the browser says is
 * ever the reason credits are granted. The two things that grant credit are a webhook
 * whose signature verifies, and a server-side fetch of the order that reports PAID.
 */

const LIVE = 'https://api.cashfree.com/pg';
const SANDBOX = 'https://sandbox.cashfree.com/pg';

/** Cashfree pins behaviour to a dated version; sending none gets an old one. */
const API_VERSION = '2023-08-01';

export interface CashfreeConfig {
  appId: string;
  secretKey: string;
  /** Sandbox until someone deliberately says production. */
  mode: 'sandbox' | 'production';
}

/**
 * Settings first, environment second — the same order as MSG91 and the WhatsApp
 * credentials, so switching provider never needs a deploy.
 */
export async function getCashfreeConfig(): Promise<CashfreeConfig | null> {
  let appId = process.env.CASHFREE_APP_ID || '';
  let secretKey = process.env.CASHFREE_SECRET_KEY || '';
  let mode = (process.env.CASHFREE_MODE || '').toLowerCase();

  try {
    const rows = await prisma.adminSettings.findMany({
      where: { key: { in: ['cashfree_app_id', 'cashfree_secret_key', 'cashfree_mode'] } },
      select: { key: true, value: true },
    });
    for (const row of rows) {
      const value = String(row.value || '').trim();
      if (!value) continue;
      if (row.key === 'cashfree_app_id') appId = value;
      if (row.key === 'cashfree_secret_key') secretKey = value;
      if (row.key === 'cashfree_mode') mode = value.toLowerCase();
    }
  } catch (error) {
    logger.warn('[cashfree] could not read settings, using environment only:', error);
  }

  if (!appId.trim() || !secretKey.trim()) return null;
  // Anything that is not exactly "production" is sandbox. Defaulting the other way
  // would let a typo take real money.
  return {
    appId: appId.trim(),
    secretKey: secretKey.trim(),
    mode: mode === 'production' || mode === 'prod' || mode === 'live' ? 'production' : 'sandbox',
  };
}

export async function isCashfreeConfigured(): Promise<boolean> {
  return (await getCashfreeConfig()) !== null;
}

export function cashfreeBaseUrl(mode: CashfreeConfig['mode']): string {
  return mode === 'production' ? LIVE : SANDBOX;
}

function headersFor(config: CashfreeConfig): Record<string, string> {
  return {
    'x-api-version': API_VERSION,
    'x-client-id': config.appId,
    'x-client-secret': config.secretKey,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

export interface CreateCashfreeOrderArgs {
  orderId: string;
  /** Rupees, not paise — Cashfree takes a decimal amount, unlike Razorpay. */
  amount: number;
  customerId: string;
  customerPhone: string;
  customerEmail?: string;
  customerName?: string;
  returnUrl: string;
  notes?: Record<string, string>;
}

export interface CashfreeOrder {
  orderId: string;
  paymentSessionId: string;
}

/**
 * Open an order. The payment_session_id it returns is what the browser SDK needs; it is
 * not a secret in the sense the API key is, but it is single-use and short-lived.
 */
export async function createCashfreeOrder(
  args: CreateCashfreeOrderArgs,
): Promise<{ ok: true; order: CashfreeOrder } | { ok: false; error: string }> {
  const config = await getCashfreeConfig();
  if (!config) return { ok: false, error: 'Cashfree is not configured' };

  // Rupees to two places. Cashfree rejects more, and a float that arrives as
  // 999.9999999 is a rejected order for no reason a person could guess at.
  const amount = Math.round(args.amount * 100) / 100;
  if (!(amount > 0)) return { ok: false, error: `Not a chargeable amount: ${args.amount}` };

  try {
    const response = await fetch(`${cashfreeBaseUrl(config.mode)}/orders`, {
      method: 'POST',
      headers: headersFor(config),
      body: JSON.stringify({
        order_id: args.orderId,
        order_amount: amount,
        order_currency: 'INR',
        customer_details: {
          customer_id: args.customerId,
          customer_phone: args.customerPhone,
          ...(args.customerEmail ? { customer_email: args.customerEmail } : {}),
          ...(args.customerName ? { customer_name: args.customerName } : {}),
        },
        order_meta: { return_url: args.returnUrl },
        ...(args.notes ? { order_tags: args.notes } : {}),
      }),
    });

    const raw = await response.text().catch(() => '');
    let data: any = {};
    try { data = raw ? JSON.parse(raw) : {}; } catch { data = {}; }

    if (!response.ok) {
      const detail = data?.message || raw.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
      return { ok: false, error: `Cashfree returned ${response.status}: ${detail}` };
    }
    if (!data?.payment_session_id) {
      return { ok: false, error: 'Cashfree did not return a payment session' };
    }
    return {
      ok: true,
      order: { orderId: String(data.order_id || args.orderId), paymentSessionId: String(data.payment_session_id) },
    };
  } catch (error: any) {
    return { ok: false, error: error?.message || 'Cashfree request failed' };
  }
}

/**
 * What Cashfree says about an order, asked of Cashfree.
 *
 * This is the ONLY thing that decides whether money arrived. The browser comes back from
 * the checkout with a claim; the claim is worth nothing until this agrees.
 */
export async function fetchCashfreeOrder(
  orderId: string,
): Promise<{ ok: true; status: string; paymentId?: string; method?: string; amount?: number } | { ok: false; error: string }> {
  const config = await getCashfreeConfig();
  if (!config) return { ok: false, error: 'Cashfree is not configured' };

  try {
    const response = await fetch(`${cashfreeBaseUrl(config.mode)}/orders/${encodeURIComponent(orderId)}`, {
      method: 'GET',
      headers: headersFor(config),
    });
    const raw = await response.text().catch(() => '');
    let data: any = {};
    try { data = raw ? JSON.parse(raw) : {}; } catch { data = {}; }

    if (!response.ok) {
      const detail = data?.message || raw.replace(/\s+/g, ' ').trim().slice(0, 200);
      return { ok: false, error: `Cashfree returned ${response.status}: ${detail}` };
    }
    return {
      ok: true,
      status: String(data.order_status || 'UNKNOWN'),
      amount: typeof data.order_amount === 'number' ? data.order_amount : undefined,
    };
  } catch (error: any) {
    return { ok: false, error: error?.message || 'Cashfree request failed' };
  }
}

/** Only this one word means the money is there. */
export function cashfreeOrderIsPaid(status: string): boolean {
  return String(status).toUpperCase() === 'PAID';
}

/**
 * Is this webhook really from Cashfree?
 *
 * Their scheme signs the timestamp CONCATENATED WITH THE RAW BODY, so the body must be
 * verified exactly as it arrived — parsing it to JSON and re-serialising changes the
 * bytes and the signature stops matching. Compared with a timing-safe equality, because
 * a comparison that returns early leaks the signature one character at a time.
 */
export function verifyCashfreeWebhook(args: {
  rawBody: string;
  timestamp: string;
  signature: string;
  secretKey: string;
}): boolean {
  if (!args.rawBody || !args.timestamp || !args.signature) return false;
  try {
    const expected = crypto
      .createHmac('sha256', args.secretKey)
      .update(args.timestamp + args.rawBody)
      .digest('base64');
    const given = Buffer.from(args.signature);
    const mine = Buffer.from(expected);
    if (given.length !== mine.length) return false;
    return crypto.timingSafeEqual(given, mine);
  } catch {
    return false;
  }
}

/** For the admin diagnostic: what is set, never the values. */
export async function getCashfreeDiagnostics() {
  const config = await getCashfreeConfig();
  return {
    configured: !!config,
    mode: config?.mode ?? null,
    appIdSet: !!config?.appId,
    secretKeySet: !!config?.secretKey,
    note: config
      ? `Configured in ${config.mode} mode.`
      : 'Set cashfree_app_id and cashfree_secret_key in admin settings, or CASHFREE_APP_ID and CASHFREE_SECRET_KEY in the environment.',
  };
}
