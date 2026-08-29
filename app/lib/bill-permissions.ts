import { prisma } from './db';

/**
 * Check if a user can edit a bill.
 * - Admins: always allowed
 * - Owners: allowed once by default; unlimited if ALLOW_MULTIPLE_BILL_EDITS=true
 */
export async function canUserEditBill(
  userId: string,
  billId: string,
  userRole: string
): Promise<{ allowed: boolean; reason?: string }> {
  try {
    const bill = await prisma.bill.findUnique({
      where: { id: billId },
      select: {
        editCount: true,
        status: true,
        contract: { select: { userId: true } }
      }
    });

    if (!bill) return { allowed: false, reason: 'Bill not found' };

    // Admins always allowed
    if (userRole === 'admin' || userRole === 'superadmin') return { allowed: true };

    // Ownership check
    if (bill.contract.userId !== userId) {
      return { allowed: false, reason: 'You can only edit your own bills' };
    }

    // A bill that has been submitted for approval, approved, or passed by accounts is
    // a record other people have signed. Editing it changed the amounts while
    // status/approvedBy/approvedAt still vouched for the OLD numbers — the proposal and
    // its approval quietly came to disagree. The way to change a submitted bill is the
    // official's request-revision, which reopens it deliberately.
    if (bill.status && !['draft', 'revision_requested'].includes(bill.status)) {
      return {
        allowed: false,
        reason: bill.status === 'submitted'
          ? 'This bill has been submitted for approval and can no longer be edited. Ask the official to request a revision.'
          : 'This bill has been approved and can no longer be edited. Ask the official to request a revision.',
      };
    }

    // Check ALLOW_MULTIPLE_BILL_EDITS admin setting
    const setting = await prisma.adminSettings.findUnique({
      where: { key: 'ALLOW_MULTIPLE_BILL_EDITS' }
    });
    const multipleEditsAllowed = setting?.value === 'true';

    if (!multipleEditsAllowed && (bill.editCount ?? 0) >= 1) {
      return {
        allowed: false,
        reason: 'Bills can only be edited once. Contact admin if you need further changes.'
      };
    }

    return { allowed: true };
  } catch (error) {
    console.error('Error checking bill edit permission:', error);
    return { allowed: false, reason: 'Error checking permissions' };
  }
}

export async function canUserDeleteBill(
  userId: string,
  billId: string,
  userRole: string
): Promise<{ allowed: boolean; reason?: string }> {
  try {
    // Get the bill with its contract to check ownership
    const bill = await prisma.bill.findUnique({
      where: { id: billId },
      include: {
        contract: {
          select: {
            userId: true
          }
        }
      }
    });

    if (!bill) {
      return { allowed: false, reason: 'Bill not found' };
    }

    if (userRole === 'admin' || userRole === 'superadmin') return { allowed: true };

    const isOwner = bill.contract.userId === userId;
    if (!isOwner) {
      return { allowed: false, reason: 'You can only delete your own bills' };
    }

    // An approved or accounts-passed bill is a railway record; deleting it destroys
    // what someone signed. A merely submitted bill may still be withdrawn — deleting
    // it is the contractor retracting their own proposal before anyone acts on it.
    if (bill.status === 'approved' || bill.status === 'passed') {
      return {
        allowed: false,
        reason: 'This bill has been approved and can no longer be deleted. Contact an admin if it must be removed.',
      };
    }

    return { allowed: true };
  } catch (error) {
    console.error('Error checking bill deletion permission:', error);
    return { allowed: false, reason: 'Error checking permissions' };
  }
}

export async function canUserDeleteBills(
  userId: string,
  billIds: string[],
  userRole: string
): Promise<{ allowed: boolean; reason?: string; disallowedBills?: string[]; disallowedBillIds?: string[] }> {
  try {
    // Get all bills with their contracts
    const bills = await prisma.bill.findMany({
      where: { id: { in: billIds } },
      include: {
        contract: {
          select: {
            userId: true
          }
        }
      }
    });

    if (bills.length === 0) {
      return { allowed: false, reason: 'No bills found' };
    }

    if (userRole === 'admin' || userRole === 'superadmin') return { allowed: true };

    // Same two rules as the single delete: own bills only, and nothing already
    // approved or passed — those are records other people signed.
    const disallowed = bills
      .filter(bill => bill.contract.userId !== userId || bill.status === 'approved' || bill.status === 'passed');
    const disallowedBills = disallowed.map(bill => bill.billNo);
    // Ids too (billNo is for the human-readable reason): the bills page maps deletability
    // per row from ONE batch call instead of one request per bill — that per-row fan-out
    // fired ~30 parallel lambdas per list render and helped exhaust the pooler's
    // client-connection cap. Ids requested but not found count as disallowed.
    const foundIds = new Set(bills.map(bill => bill.id));
    const disallowedBillIds = [
      ...disallowed.map(bill => bill.id),
      ...billIds.filter(id => !foundIds.has(id)),
    ];
    return {
      allowed: disallowedBillIds.length === 0,
      reason: disallowedBills.length > 0
        ? `You can only delete your own, not-yet-approved bills. Cannot delete: ${disallowedBills.join(', ')}`
        : undefined,
      disallowedBills,
      disallowedBillIds
    };
  } catch (error) {
    console.error('Error checking bulk bill deletion permission:', error);
    return { allowed: false, reason: 'Error checking permissions' };
  }
}
