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
    return {
      allowed: isOwner,
      reason: isOwner ? undefined : 'You can only delete your own bills'
    };
  } catch (error) {
    console.error('Error checking bill deletion permission:', error);
    return { allowed: false, reason: 'Error checking permissions' };
  }
}

export async function canUserDeleteBills(
  userId: string,
  billIds: string[],
  userRole: string
): Promise<{ allowed: boolean; reason?: string; disallowedBills?: string[] }> {
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

    const disallowedBills = bills
      .filter(bill => bill.contract.userId !== userId)
      .map(bill => bill.billNo);
    return {
      allowed: disallowedBills.length === 0,
      reason: disallowedBills.length > 0
        ? `You can only delete your own bills. Cannot delete: ${disallowedBills.join(', ')}`
        : undefined,
      disallowedBills
    };
  } catch (error) {
    console.error('Error checking bulk bill deletion permission:', error);
    return { allowed: false, reason: 'Error checking permissions' };
  }
}
