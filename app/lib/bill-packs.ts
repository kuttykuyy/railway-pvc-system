import { getAdminSetting, getBillingSettings } from './admin-settings';

/**
 * Bill packs and the single-bill shortcut — the two ways to pay other than a plain
 * rupee-for-credit top-up.
 *
 * A pack is "N bills for ₹P": the customer pays P (+GST) and is credited N × the
 * per-bill cost, so the existing per-bill deduction works unchanged and the discount
 * shows up as extra credits rather than a second price list. The single-bill shortcut
 * lets someone blocked on a bill pay exactly that bill's cost, below the normal
 * ₹1,000 top-up minimum, because the alternative is that they leave.
 *
 * Everything here is worked out on the server from admin settings. The client only
 * says WHICH pack or purpose it wants; it never sends a price or a credit count that
 * is believed.
 */

export const MIN_TOPUP_AMOUNT = 1000;

export interface BillPack {
  /** How many bills the pack is worth. */
  bills: number;
  /** Rupees charged before GST. */
  price: number;
  /** An AI-read bill pack: credited at AI_BILL_PROCESSING_COST per bill instead. */
  ai: boolean;
}

const DEFAULT_PACKS: BillPack[] = [
  { bills: 10, price: 1499, ai: false },
  { bills: 30, price: 3499, ai: false },
  { bills: 10, price: 3999, ai: true },
  { bills: 30, price: 9999, ai: true },
];

/** The packs on sale, from the BILL_PACKS admin setting; the defaults if unset or malformed. */
export async function getBillPacks(): Promise<BillPack[]> {
  const raw = await getAdminSetting('BILL_PACKS', null);
  const list = Array.isArray(raw) ? raw : DEFAULT_PACKS;
  const packs = list
    .map((p: any) => ({ bills: Math.floor(Number(p?.bills)), price: Math.round(Number(p?.price)), ai: p?.ai === true }))
    .filter((p: BillPack) => Number.isFinite(p.bills) && p.bills >= 2 && Number.isFinite(p.price) && p.price > 0);
  return packs.length > 0 ? packs : DEFAULT_PACKS;
}

export type PurchasePurpose = 'topup' | 'pack' | 'single_bill';

export interface ResolvedPurchase {
  purpose: PurchasePurpose;
  /** Rupees charged before GST — the invoice's taxable value. */
  price: number;
  /** Credits added to the wallet on success. Equals price except for a pack. */
  credits: number;
  /** For a pack: how many bills it covers, and whether they are AI-read bills. */
  packBills: number | null;
  packAi: boolean;
  /** One line for the checkout and the transaction record. */
  label: string;
}

/**
 * Turn what the client asked for into what is charged and what is granted.
 * Returns an error message (for a 400) when the request is not a thing on sale.
 */
export async function resolvePurchase(input: {
  purpose?: unknown;
  packBills?: unknown;
  /** With packBills: pick the AI-bill pack of that size rather than the normal one. */
  packAi?: unknown;
  creditAmount?: unknown;
  /** The buyer's negotiated per-bill fee (User.customProcessingFee), if they have one. */
  customBillCost?: number | null;
}): Promise<{ ok: true; purchase: ResolvedPurchase } | { ok: false; error: string; code: string }> {
  const { billCost, aiBillCost } = await getBillingSettings();
  const custom = Number(input.customBillCost);
  const singleBillCosts = [billCost, aiBillCost, ...(Number.isFinite(custom) && custom > 0 ? [custom] : [])];
  const purpose: PurchasePurpose =
    input.purpose === 'pack' || input.purpose === 'single_bill' ? input.purpose : 'topup';

  if (purpose === 'pack') {
    const bills = Number(input.packBills);
    const ai = input.packAi === true;
    const pack = (await getBillPacks()).find((p) => p.bills === bills && p.ai === ai);
    if (!pack) {
      return { ok: false, error: 'That bill pack is not available.', code: 'UNKNOWN_PACK' };
    }
    return {
      ok: true,
      purchase: {
        purpose,
        price: pack.price,
        credits: pack.bills * (pack.ai ? aiBillCost : billCost),
        packBills: pack.bills,
        packAi: pack.ai,
        label: pack.ai ? `${pack.bills}-AI-bill pack` : `${pack.bills}-bill pack`,
      },
    };
  }

  const amount = Number(input.creditAmount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: 'creditAmount must be a positive number', code: 'INVALID_CREDIT_AMOUNT_VALUE' };
  }

  if (purpose === 'single_bill') {
    // Exactly one bill's cost, nothing else: the shortcut exists to unblock a bill,
    // not to be a way around the top-up minimum.
    if (!singleBillCosts.includes(amount)) {
      return { ok: false, error: `A single bill costs ₹${billCost} (₹${aiBillCost} with AI reading).`, code: 'INVALID_SINGLE_BILL_AMOUNT' };
    }
    return {
      ok: true,
      purchase: { purpose, price: amount, credits: amount, packBills: null, packAi: false, label: 'One bill' },
    };
  }

  if (amount < MIN_TOPUP_AMOUNT) {
    return {
      ok: false,
      error: `Minimum top-up amount is ₹${MIN_TOPUP_AMOUNT.toLocaleString('en-IN')}`,
      code: 'MINIMUM_TOPUP_AMOUNT',
    };
  }
  return {
    ok: true,
    purchase: { purpose, price: amount, credits: amount, packBills: null, packAi: false, label: `Credit top-up - ₹${amount}` },
  };
}

/**
 * How many credits a paid Razorpay transaction grants. The row's creditAmount is the
 * rupees paid (so invoices stay tied to money); a pack records the larger grant in
 * notes.creditsGranted. Read here, once, so verify-payment and the webhook can never
 * disagree.
 */
export function creditsGrantedFor(transaction: { creditAmount: number; notes: unknown }): number {
  const granted = Number((transaction.notes as any)?.creditsGranted);
  return Number.isFinite(granted) && granted > 0 ? granted : transaction.creditAmount;
}
