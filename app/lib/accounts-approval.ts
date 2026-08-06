/**
 * The accounts/audit stage of a PVC proposal.
 *
 * A proposal is approved by the executive (engineering) side and then vetted by
 * accounts before it is passed for payment. They answer for different things — the
 * executive for the work and the quantities, accounts for the calculation, the
 * indices and the contract's eligibility — so the bill records both separately.
 *
 *   draft -> submitted -> approved (executive) -> passed_for_payment (accounts)
 *
 * Accounts can also return a proposal, which puts it back to "submitted" with the
 * reason recorded, so the executive side answers the objection rather than the
 * contractor silently re-submitting.
 */

import { prisma } from './db';

export const ACCOUNTS_ROLES = ['accounts_official', 'ACCOUNTS_OFFICIAL'];

/** Statuses this stage cares about. */
export const AWAITING_ACCOUNTS = 'approved';
export const PASSED_FOR_PAYMENT = 'passed_for_payment';

export function isAccountsUser(role?: string | null): boolean {
  return ACCOUNTS_ROLES.includes(String(role || ''));
}

/** Accounts staff, and admins, may act at this stage. */
export function canActAsAccounts(role?: string | null): boolean {
  const r = String(role || '');
  return isAccountsUser(r) || r === 'admin' || r === 'superadmin';
}

export interface AccountsActionResult {
  ok: boolean;
  status?: number;
  error?: string;
  bill?: any;
}

/**
 * Passes a vetted proposal for payment, or returns it with a reason.
 *
 * The status check is what keeps the two stages honest: only a bill the executive
 * side has approved can reach accounts, so a contractor cannot submit straight to
 * payment and an accounts user cannot pass something still under revision.
 */
export async function actOnBillAsAccounts(o: {
  billId: string;
  userId: string;
  action: 'pass' | 'return';
  comments?: string | null;
}): Promise<AccountsActionResult> {
  const bill = await prisma.bill.findUnique({ where: { id: o.billId } });
  if (!bill) return { ok: false, status: 404, error: 'Bill not found' };

  if (bill.status !== AWAITING_ACCOUNTS) {
    return {
      ok: false,
      status: 400,
      error: bill.status === PASSED_FOR_PAYMENT
        ? 'This proposal has already been passed for payment.'
        : `Only a proposal approved by the executive can be vetted by accounts. This one is "${bill.status}".`,
    };
  }

  if (o.action === 'return' && !String(o.comments || '').trim()) {
    return { ok: false, status: 400, error: 'Please give the reason for returning the proposal.' };
  }

  const newStatus = o.action === 'pass' ? PASSED_FOR_PAYMENT : 'submitted';

  const updated = await prisma.bill.update({
    where: { id: o.billId },
    data: o.action === 'pass'
      ? {
        status: PASSED_FOR_PAYMENT,
        passedAt: new Date(),
        passedBy: o.userId,
        passedComments: o.comments || null,
        accountsReturnReason: null,
      }
      : {
        // Back to the executive stage. The earlier approval is cleared: it has to be
        // given again once the objection is answered, or the record would show a bill
        // both approved and outstanding.
        status: 'submitted',
        accountsReturnReason: o.comments || null,
        approvedAt: null,
        approvedBy: null,
        passedAt: null,
        passedBy: null,
      },
  });

  await prisma.billApprovalHistory.create({
    data: {
      billId: o.billId,
      userId: o.userId,
      action: o.action === 'pass' ? 'passed_for_payment' : 'returned_by_accounts',
      previousStatus: bill.status,
      newStatus,
      comments: o.comments || (o.action === 'pass' ? 'Passed for payment by accounts' : 'Returned by accounts'),
    },
  });

  return { ok: true, bill: updated };
}

/**
 * The accounts inbox: proposals the executive has approved and accounts have not yet
 * passed. Scoped to the user's own zone unless they are an admin — a division's
 * accounts office has no business seeing another zone's proposals.
 */
export async function listBillsAwaitingAccounts(user: { id: string; role: string; railwayZone?: string | null }) {
  const isAdmin = user.role === 'admin' || user.role === 'superadmin';
  // An accounts user with no zone set sees NOTHING, not everything. The executive side
  // already fails closed this way (agreementMatchesZone returns false without a zone),
  // and a blank zone is what a promoted account has until an admin sets one — which is
  // exactly when it must not become a pass to every division's bills.
  if (!isAdmin && !user.railwayZone) return [];

  return prisma.bill.findMany({
    where: {
      status: AWAITING_ACCOUNTS,
      ...(isAdmin ? {} : { zone: user.railwayZone }),
    },
    include: {
      contract: { select: { agreementNo: true, contractorName: true, workDescription: true, baseMonth: true } },
      pvcCalculation: { select: { totalPvc: true, cumulativePvc: true } },
      approvedByUser: { select: { name: true, email: true, designation: true } },
    },
    orderBy: { approvedAt: 'asc' },
  });
}
