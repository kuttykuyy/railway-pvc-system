/**
 * Which bills the report routes must stamp "NOT FOR OFFICIAL USE".
 *
 * Two kinds. A trial bill carries a transaction row marked 'trial', and its stamp is
 * waived once the owner has topped up. A bill created from a chat that carries NO
 * transaction row was never charged at all — the chat flows used to store bills that
 * way — and every route read the missing row as "paid". Such a bill is stamped
 * whatever the owner has since paid for: nothing was ever paid for it.
 */
export interface StampableBill {
  billTransaction?: { discountType: string | null } | null;
  createdVia?: string | null;
}

const CHAT_ORIGINS = new Set(['telegram', 'whatsapp']);

export function isTrialBill(bill: StampableBill | null | undefined): boolean {
  return bill?.billTransaction?.discountType === 'trial';
}

export function isUnsettledChatBill(bill: StampableBill | null | undefined): boolean {
  return !!bill && !bill.billTransaction && CHAT_ORIGINS.has(String(bill.createdVia || ''));
}

/** The stamp applies: an unwaived trial bill, or a chat bill nobody ever paid for. */
export function needsTrialWatermark(bill: StampableBill | null | undefined, trialWaived: boolean): boolean {
  return (isTrialBill(bill) && !trialWaived) || isUnsettledChatBill(bill);
}
