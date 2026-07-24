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

export interface CreateReportPaymentLinkArgs {
  chatId: string;
  amountRupees: number;
  agreementNo: string;
  billNo?: string;
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

  const description = `PVC statement — ${args.agreementNo}${args.billNo ? ` (Bill ${args.billNo})` : ''}`;

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
