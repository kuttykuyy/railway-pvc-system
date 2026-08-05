/**
 * Paying for a Telegram PVC report — in the chat, no account needed.
 *
 * The PVC amount is free; the PDF statement is paid. We create a Razorpay payment
 * link (UPI / card / net banking) and post it in the chat. The chat id travels in
 * the link's `notes`, so when Razorpay's webhook reports the payment we know which
 * chat to send the report to — see app/api/razorpay/webhook.
 */

import { getRazorpayInstance } from './razorpay';
import { getBillingSettings } from './admin-settings';

/** Marker on the Razorpay notes so the shared webhook can spot our payments. */
export const TELEGRAM_REPORT_NOTE_KIND = 'telegram_pvc_report';

/** Price of one PVC statement. A Telegram bill is AI-read, so it uses that price. */
export async function getReportPriceRupees(): Promise<number> {
  const settings = await getBillingSettings();
  return settings.aiBillCost || 499;
}

export interface BulkReportPrice {
  count: number;
  unitPrice: number;
  /** count x unitPrice, before any discount. */
  gross: number;
  discountPercent: number;
  /** Whole rupees off, so the payable total is a round number. */
  discount: number;
  total: number;
}

/**
 * What a set of statements costs when paid with one link (/payall).
 *
 * Paying for several bills at once earns a discount — the work is one payment and
 * one delivery, and a contractor catching up on a year's billing shouldn't pay the
 * single-bill rate on every one. Both tiers are admin settings, so the rate can be
 * changed without a deploy.
 */
export async function getBulkReportPrice(count: number): Promise<BulkReportPrice> {
  const settings = await getBillingSettings();
  const unitPrice = settings.aiBillCost || 499;
  const gross = unitPrice * count;

  const rawPercent = count >= 5
    ? settings.payAllDiscountPercentBulk
    : count >= 2
      ? settings.payAllDiscountPercent
      : 0;
  // A misconfigured setting must never make a statement free or negative.
  const discountPercent = Number.isFinite(rawPercent) ? Math.min(Math.max(rawPercent, 0), 90) : 0;

  const total = Math.round(gross * (1 - discountPercent / 100));
  return { count, unitPrice, gross, discountPercent, discount: gross - total, total };
}

export interface CreateReportPaymentLinkArgs {
  chatId: string;
  amountRupees: number;
  agreementNo: string;
  billNo?: string;
  /** Set when one link pays for several statements at once (see /payall). */
  reportCount?: number;
}

/**
 * Creates a Razorpay payment link for one report.
 * Returns the short URL plus the link id (kept so we can ask Razorpay whether it
 * was paid, as a fallback when the webhook doesn't reach us).
 * Throws when Razorpay isn't configured or the API call fails.
 */
export async function createReportPaymentLink(args: CreateReportPaymentLinkArgs): Promise<{ url: string; id: string }> {
  const razorpay = getRazorpayInstance();
  if (!razorpay) throw new Error('Razorpay is not configured');

  const description = args.reportCount && args.reportCount > 1
    ? `PVC statements — ${args.agreementNo} (${args.reportCount} bills)`
    : `PVC statement — ${args.agreementNo}${args.billNo ? ` (Bill ${args.billNo})` : ''}`;

  const link: any = await razorpay.paymentLink.create({
    // Razorpay works in paise.
    amount: Math.round(args.amountRupees * 100),
    currency: 'INR',
    accept_partial: false,
    description: description.slice(0, 2048),
    notes: {
      // The webhook reads these back to identify the chat to deliver to.
      kind: TELEGRAM_REPORT_NOTE_KIND,
      telegramChatId: String(args.chatId),
      agreementNo: String(args.agreementNo),
    },
    reminder_enable: false,
notify: { sms: false, email: false },
  } as any);

  const url = link?.short_url;
  if (!url) throw new Error('Razorpay did not return a payment link URL');
  return { url, id: String(link?.id || '') };
}

/**
 * Asks Razorpay directly whether a payment link has been paid.
 *
 * Fallback for when the dashboard webhook isn't configured (or fails) — without
 * it a paying user would be stranded with no report. Returns false on any error
 * so the caller can tell the user to try again rather than crash.
 */
export async function isPaymentLinkPaid(linkId: string): Promise<boolean> {
  if (!linkId) return false;
  const razorpay = getRazorpayInstance();
  if (!razorpay) return false;
  try {
    const link: any = await razorpay.paymentLink.fetch(linkId);
    return link?.status === 'paid';
  } catch (err) {
    console.error('[Telegram] payment link status check failed:', err);
    return false;
  }
}
