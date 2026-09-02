import { prisma } from './db';
import { processPaymentForBill, validateBillProcessingForUser } from './payment-validation';
import { getBillingSettings } from './admin-settings';

/**
 * Charging for bills created from a chat (Telegram, WhatsApp).
 *
 * The web route decides, before it builds a bill, whether the account gets it free
 * (role, free account, ₹0 fee, remaining trial) or pays from its credit balance, and
 * then records a BillTransaction that says which. The chat flows did neither: the
 * Telegram document flow stored the bill with no transaction row at all, and the
 * /createbill and "create bill" conversations wrote a ₹0 row marked 'trial' without
 * touching the trial counter or the balance. Every report route reads a bill with no
 * row as fully paid, and the trial watermark is waived for the owner after one
 * top-up — so a chat was a clean statement for nothing, as many times as wanted.
 *
 * These two functions put chat bills through the same decision and the same charge.
 */

export type ChatBillChargeDecision =
  | { canCreate: true; isFree: boolean; requiredPayment: number; reason: string }
  | { canCreate: false; message: string; requiredPayment?: number };

/** Whether this account may have another bill, and what it costs — decided BEFORE creating it. */
export async function decideChatBillCharge(userId: string): Promise<ChatBillChargeDecision> {
  const verdict = await validateBillProcessingForUser(userId, false);
  if (!verdict.canProcess) {
    return { canCreate: false, message: verdict.reason || 'This bill cannot be processed right now.', requiredPayment: verdict.requiredPayment };
  }
  return {
    canCreate: true,
    isFree: !!verdict.isFree,
    requiredPayment: verdict.isFree ? 0 : (verdict.requiredPayment || 0),
    reason: verdict.reason || '',
  };
}

/**
 * Take the trial slot or the money for a bill that has just been created. A bill that
 * cannot be settled is deleted: a bill without a paid transaction must not exist, since
 * every report route reads its absence as "paid".
 */
export async function settleChatBill(o: {
  userId: string;
  billId: string;
  agreementNo: string;
  decision: Extract<ChatBillChargeDecision, { canCreate: true }>;
}): Promise<{ ok: true; message: string } | { ok: false; message: string }> {
  const { userId, billId, agreementNo, decision } = o;
  let result = await processPaymentForBill(
    userId,
    billId,
    decision.isFree ? 'free_account' : 'credit_balance',
    undefined,
    undefined,
    decision.isFree ? undefined : decision.requiredPayment,
    undefined,
    agreementNo,
    false,
    !decision.isFree,
  );

  // A refused trial (this agreement already took its free bill, under any account) is
  // charged instead when the balance allows — the same downgrade the web route makes.
  if (!result.success && decision.isFree) {
    const user = await prisma.user.findUnique({ where: { id: userId }, include: { customerAccount: true } });
    const settings = await getBillingSettings();
    const cost = user?.customProcessingFee !== null && user?.customProcessingFee !== undefined && user.customProcessingFee > 0
      ? user.customProcessingFee
      : (settings.billCost || 199);
    if ((user?.customerAccount?.creditBalance || 0) >= cost) {
      result = await processPaymentForBill(userId, billId, 'credit_balance', undefined, undefined, cost, undefined, agreementNo, false, true);
    }
  }

  if (!result.success) {
    await prisma.bill.delete({ where: { id: billId } }).catch((err) =>
      console.error('[chat-bill-charge] could not remove unsettled bill:', err));
    return { ok: false, message: result.message };
  }
  return { ok: true, message: result.message };
}
