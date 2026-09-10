import { prisma } from './db';
import { schemaQualified } from './db-schema';

/**
 * A payment somebody started and did not finish.
 *
 * Two moments count: a bill blocked at "insufficient credits" (the person wanted the
 * bill and was shown a price), and a Razorpay top-up order that was opened but never
 * paid. Both used to vanish — the person left, nobody knew, and the funnel showed
 * "awaiting payment" with no follow-up. Each is recorded here as an intent; the
 * payment-reminder cron follows up after ~2 hours and ~1 day, and stops the moment
 * the person pays (any credit added since the intent resolves it).
 *
 * Best-effort and never throws: recording is a side effect of the blocked request,
 * and a failure to record must not deepen the original one. Raw SQL because the table
 * ships through Pending DB Changes — a schema field for an unapplied table takes
 * unrelated queries down with it.
 */
export type PaymentIntentKind = 'bill_blocked' | 'topup_started';

export async function recordPaymentIntent(args: {
  userId: string;
  userEmail: string | null;
  kind: PaymentIntentKind;
  /** Rupees the person needed or was about to pay. */
  amount: number;
  /** One line of context for the message: an agreement number, a file name. */
  context?: string | null;
}): Promise<void> {
  try {
    const table = await schemaQualified('payment_intents');
    await prisma.$executeRawUnsafe(
      `INSERT INTO ${table} ("userId", "userEmail", "kind", "amount", "context") VALUES ($1, $2, $3, $4, $5)`,
      args.userId,
      args.userEmail,
      args.kind,
      Number(args.amount) || 0,
      (args.context || '').slice(0, 200) || null,
    );
  } catch (err) {
    console.error('payment-intent: could not record (table not applied yet?):', err);
  }
}

function escapeHtml(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** What the reminder says, per kind and arm, shared by the email and the Telegram text. */
export function reminderCopy(args: {
  kind: PaymentIntentKind;
  amount: number;
  context?: string | null;
  arm: 1 | 2;
  billCost: number;
  packBills?: number;
  packPrice?: number;
}): { subject: string; headline: string; body: string; cta: string } {
  const amount = `₹${Math.round(args.amount).toLocaleString('en-IN')}`;
  const about = args.context ? ` for ${args.context}` : '';
  const pack = args.packBills && args.packPrice
    ? ` Or take the ${args.packBills}-bill pack for ₹${args.packPrice.toLocaleString('en-IN')} and never stop at this step again.`
    : '';
  if (args.kind === 'bill_blocked') {
    return args.arm === 1
      ? {
          subject: `Your PVC bill${about} is one step away`,
          headline: 'Your bill is calculated and waiting',
          body: `You uploaded a bill${about} and IR-PVC worked out the PVC — it just needs ${amount} to process it. Pay for this one bill and the statement is yours in a minute.${pack}`,
          cta: `Pay ${amount} for this bill`,
        }
      : {
          subject: `Still need that PVC statement${about}?`,
          headline: 'Your bill is still waiting',
          body: `Yesterday your bill${about} stopped at the payment step. It is still there, calculated, for ${amount}. If something went wrong with the payment, reply to this email and we'll sort it out.${pack}`,
          cta: 'Finish my bill',
        };
  }
  return args.arm === 1
    ? {
        subject: 'Your IR-PVC top-up was not completed',
        headline: 'Your top-up did not go through',
        body: `You started a top-up of ${amount} but the payment was not completed, so no credits were added. If the bank page failed, try again — UPI, card and net banking all work.${pack}`,
        cta: 'Try the top-up again',
      }
    : {
        subject: 'Need help with your IR-PVC top-up?',
        headline: 'Your top-up is still pending',
        body: `Your top-up of ${amount} from yesterday was never completed. If the payment was taken from your bank but nothing arrived, reply to this email with the reference and we will credit it by hand.${pack}`,
        cta: 'Add credits',
      };
}

/** The reminder email. Plain and short — one thing to do, one button. */
export function paymentReminderHtml(copy: { headline: string; body: string; cta: string }, url: string): string {
  return `<!DOCTYPE html>
<html>
  <head><meta charset="utf-8"><title>${escapeHtml(copy.headline)}</title></head>
  <body style="background-color:#f6f9fc; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif; margin:0; padding:0;">
    <div style="background-color:#ffffff; margin:48px auto; max-width:580px; border-radius:8px; box-shadow:0 2px 8px rgba(0,0,0,0.05); overflow:hidden;">
      <div style="background-color:#1e40af; padding:22px 32px;">
        <h1 style="font-size:20px; font-weight:bold; color:#ffffff; margin:0;">IR-PVC</h1>
      </div>
      <div style="padding:24px 32px 8px;">
        <h2 style="font-size:20px; line-height:28px; color:#0f172a; margin:0 0 12px;">${escapeHtml(copy.headline)}</h2>
        <p style="font-size:16px; line-height:25px; color:#334155; margin:16px 0;">${escapeHtml(copy.body)}</p>
        <div style="text-align:center; margin:28px 0;">
          <a href="${escapeHtml(url)}" style="background-color:#059669; border-radius:6px; color:#ffffff; font-size:16px; font-weight:bold; text-decoration:none; display:inline-block; padding:12px 32px;">${escapeHtml(copy.cta)}</a>
        </div>
      </div>
      <div style="padding:8px 32px 28px;">
        <hr style="border:none; border-top:1px solid #e5e7eb; margin:16px 0;">
        <p style="font-size:13px; line-height:20px; color:#94a3b8; margin:0;">
          You are receiving this because you started a payment on
          <a href="https://www.irpvc.in" style="color:#64748b;">irpvc.in</a>. This is the last reminder about it.
          Reply to this email if you need help.
        </p>
      </div>
    </div>
  </body>
</html>`;
}
