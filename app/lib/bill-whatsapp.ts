import { logger } from './logger';
import {
  getAdminWhatsAppNumber,
  isMyDreamsWhatsAppConfigured,
  sendBillPDFWithTemplate,
  validatePhoneNumber,
} from './whatsapp-mydreams';

/**
 * Telling a contractor their PVC report is ready — in ONE place, for every route that
 * creates or changes a bill.
 *
 * It used to live inline in the single-bill create route and nowhere else, so a bill
 * made through Bulk New told nobody, and an edited bill left the contractor holding the
 * figure it had replaced. Both are the paths a busy office actually uses.
 *
 * Two things this fixes on the way through:
 *
 *   1. The contractor's message was sent through sendBillPDFNotification with only the
 *      customer name, while the approved 'bill_created_with_pdf' template takes five
 *      parameters — bill number, agreement number, measurement period and amount were
 *      all left empty. The admin's copy went through sendBillPDFWithTemplate and had
 *      them. Both now go through the same function, so both are complete.
 *
 *   2. Nothing here can fail a save. Every send is caught, and the outcome is returned
 *      for logging rather than thrown. A contractor's phone being wrong is not a reason
 *      for a bill not to exist.
 *
 * A note on wording: 'bill_created_with_pdf' is the only approved template for sending
 * a bill PDF, so a revised bill goes out under it too. Its text says a bill is ready,
 * which is true of a revision as well — but if you want a message that says "revised",
 * that is a new template to get approved with the provider, not a change here.
 */

export type BillNotifyReason = 'created' | 'revised';

export interface BillNotifyOutcome {
  contractor: 'sent' | 'skipped' | 'failed';
  admin: 'sent' | 'skipped' | 'failed';
  /** Why, when either was skipped or failed. For the server log, not the user. */
  detail?: string;
}

/**
 * Send the bill's PVC report to the contractor on the contract, and a copy to the admin.
 *
 * Call it inside `after()` — every send is a slow outbound HTTP call, and the person
 * who saved the bill should not wait through them.
 */
export async function notifyBillByWhatsApp(args: {
  billId: string;
  billNo?: string | null;
  contractorPhone?: string | null;
  contractorName?: string | null;
  reason: BillNotifyReason;
  /** Set false for a batch, where one summary beats one message per bill. */
  notifyAdmin?: boolean;
}): Promise<BillNotifyOutcome> {
  const label = `${args.reason === 'revised' ? 'revised' : 'new'} bill ${args.billNo || args.billId}`;

  try {
    if (!(await isMyDreamsWhatsAppConfigured())) {
      return { contractor: 'skipped', admin: 'skipped', detail: 'WhatsApp is not configured' };
    }

    const outcome: BillNotifyOutcome = { contractor: 'skipped', admin: 'skipped' };
    const customerName = args.contractorName || 'Customer';

    // ── The contractor ──────────────────────────────────────────────────────────
    const phone = (args.contractorPhone || '').trim();
    if (!phone) {
      outcome.detail = 'the contract has no contractor phone number';
    } else if (!validatePhoneNumber(phone)) {
      outcome.detail = `the contractor phone number is not usable: ${phone}`;
    } else {
      const result = await sendBillPDFWithTemplate(args.billId, phone, customerName);
      outcome.contractor = result.success ? 'sent' : 'failed';
      if (!result.success) outcome.detail = result.error;
      logger.log(
        result.success
          ? `✅ WhatsApp: ${label} sent to contractor ${phone}`
          : `⚠️ WhatsApp: ${label} could not be sent to ${phone}: ${result.error}`,
      );
    }

    // ── The admin's copy ────────────────────────────────────────────────────────
    if (args.notifyAdmin !== false) {
      const adminNumber = await getAdminWhatsAppNumber();
      if (!adminNumber) {
        logger.log('ℹ️ WhatsApp: no admin number configured, skipping the admin copy');
      } else {
        const result = await sendBillPDFWithTemplate(args.billId, adminNumber, customerName);
        outcome.admin = result.success ? 'sent' : 'failed';
        logger.log(
          result.success
            ? `✅ WhatsApp: admin copy of ${label} sent`
            : `⚠️ WhatsApp: admin copy of ${label} failed: ${result.error}`,
        );
      }
    }

    return outcome;
  } catch (error: any) {
    // Reached only if something outside the individual sends broke. Still not the
    // saver's problem.
    console.error(`⚠️ WhatsApp notification for ${label} failed outright:`, error);
    return { contractor: 'failed', admin: 'failed', detail: error?.message || 'unknown error' };
  }
}

/**
 * One line to the admin about a whole batch, instead of one WhatsApp message per bill.
 *
 * Ten bills through Bulk New would otherwise mean ten identical admin notifications for
 * one action. The contractor still gets one message per bill — each is a separate claim
 * with its own report — but the admin wants to know a batch happened, once. It goes by
 * Telegram because that channel takes free-form text; WhatsApp would need a new approved
 * template to say anything a per-bill template does not already say.
 */
export async function notifyAdminOfBillBatch(args: {
  count: number;
  agreementNo?: string | null;
  contractorName?: string | null;
  totalPvc: number;
  billNos: string[];
}): Promise<void> {
  try {
    const { notifyTelegramAdmin } = await import('./telegram-api');
    const rupees = `Rs ${args.totalPvc.toFixed(2)}`;
    const shown = args.billNos.slice(0, 10).join(', ');
    const more = args.billNos.length > 10 ? ` and ${args.billNos.length - 10} more` : '';
    await notifyTelegramAdmin(
      `🧾 ${args.count} bill${args.count === 1 ? '' : 's'} created in one batch\n`
      + `Agreement: ${args.agreementNo || '(unknown)'}\n`
      + `Contractor: ${args.contractorName || '(unknown)'}\n`
      + `Total PVC: ${rupees}\n`
      + `Bills: ${shown}${more}`,
    );
  } catch (error) {
    console.error('⚠️ Could not send the batch summary to the admin:', error);
  }
}
