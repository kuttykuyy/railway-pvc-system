/**
 * Charging for the Telegram PVC report.
 *
 * Policy (chosen by the product owner): the PVC *amount* is free in chat — it's the
 * hook — and the PDF statement is paid. Payment reuses the site's existing credit
 * wallet, so the chat must be linked to an irpvc account (by phone) and that account
 * pays the normal AI-bill price from its credit balance.
 *
 * The deduction mirrors the other per-feature charges (see the AI classification
 * justification route): read the balance inside the transaction so the recorded
 * balanceBefore/After stay correct under concurrent charges.
 */

import { prisma } from './db';
import { getBillingSettings } from './admin-settings';

export interface ReportChargeInfo {
  /** No charge applies (admin/superadmin/railway official/free account/zero fee). */
  isFree: boolean;
  /** Price for this report in rupees (0 when free). */
  cost: number;
  /** Current wallet balance. */
  balance: number;
  /** Whether the account can pay for this report. */
  canAfford: boolean;
  /** Display name for chat messages. */
  displayName: string;
}

export async function getReportCharge(userId: string): Promise<ReportChargeInfo | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { customerAccount: true },
  });
  if (!user) return null;

  const settings = await getBillingSettings();
  // A Telegram bill is read by AI, so it's priced like an AI-uploaded bill on the site.
  const baseCost = settings.aiBillCost || 499;

  const isFree =
    user.role === 'admin' ||
    user.role === 'superadmin' ||
    user.role === 'railway_official' ||
    user.isFreeAccount ||
    user.customProcessingFee === 0;

  const balance = user.customerAccount?.creditBalance ?? 0;
  const cost = isFree ? 0 : baseCost;

  return {
    isFree,
    cost,
    balance,
    canAfford: isFree || balance >= cost,
    displayName: user.name || user.email || 'there',
  };
}

/**
 * Deducts the report price from the account's credit wallet.
 * Call this only AFTER the report has been generated successfully, so a failed
 * render never costs the user money. Returns false when the balance moved and the
 * charge can no longer be taken (the report is then withheld).
 */
export async function chargeForReport(userId: string, cost: number, reason: string): Promise<boolean> {
  if (cost <= 0) return true;
  try {
    await prisma.$transaction(async (tx) => {
      const account = await tx.customerAccount.findUnique({
        where: { userId },
        select: { creditBalance: true },
      });
      const balanceBefore = account?.creditBalance ?? 0;
      if (balanceBefore < cost) throw new Error('INSUFFICIENT_BALANCE');
      const balanceAfter = balanceBefore - cost;

      await tx.customerAccount.update({
        where: { userId },
        data: { creditBalance: { decrement: cost } },
      });
      await tx.creditTransaction.create({
        data: {
          userId,
          amount: -cost,
          type: 'deduct',
          reason,
          balanceBefore,
          balanceAfter,
        },
      });
    });
    return true;
  } catch (err) {
    console.error('[Telegram] report charge failed:', err);
    return false;
  }
}
