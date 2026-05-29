import { prisma } from './db';

/**
 * Check if a user can edit a bill
 * Contractors can only edit a bill once
 * Admins and Railway Officials can edit anytime
 */
export async function canUserEditBill(
  userId: string,
  billId: string,
  userRole: string
): Promise<{ allowed: boolean; reason?: string }> {
  try {
    // Get the bill with its contract to check ownership and edit history
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

    // Admin can edit all bills
    if (userRole === 'admin') {
      return { allowed: true };
    }

    // Check if user owns the bill
    const isOwner = bill.contract.userId === userId;
    if (!isOwner) {
      return { allowed: false, reason: 'You can only edit your own bills' };
    }

    // All users can edit their own bills without restrictions
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

    // If the user is not an admin, they can only delete their own bills
    if (userRole !== 'admin') {
      const isOwner = bill.contract.userId === userId;
      return {
        allowed: isOwner,
        reason: isOwner ? undefined : 'You can only delete your own bills'
      };
    }

    // For admins, check the setting
    const setting = await prisma.adminSettings.findUnique({
      where: { key: 'ADMIN_CAN_DELETE_OTHER_USERS_BILLS' }
    });

    const adminCanDeleteOthers = setting?.value === 'true';
    const isOwner = bill.contract.userId === userId;

    // Admin can always delete their own bills
    if (isOwner) {
      return { allowed: true };
    }

    // For bills created by other users, check the setting
    return {
      allowed: adminCanDeleteOthers,
      reason: adminCanDeleteOthers
        ? undefined
        : 'Admin permission to delete other users\' bills is disabled. You can only delete your own bills.'
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

    // If the user is not an admin, they can only delete their own bills
    if (userRole !== 'admin') {
      const disallowedBills = bills
        .filter(bill => bill.contract.userId !== userId)
        .map(bill => bill.billNo);

      return {
        allowed: disallowedBills.length === 0,
        reason:
          disallowedBills.length > 0
            ? `You can only delete your own bills. Cannot delete: ${disallowedBills.join(', ')}`
            : undefined,
        disallowedBills
      };
    }

    // For admins, check the setting
    const setting = await prisma.adminSettings.findUnique({
      where: { key: 'ADMIN_CAN_DELETE_OTHER_USERS_BILLS' }
    });

    const adminCanDeleteOthers = setting?.value === 'true';

    // Find bills not owned by the admin
    const othersBills = bills.filter((bill: any) => bill.contract.userId !== userId);

    // Admin can delete all bills if setting is enabled, or only their own bills if disabled
    if (othersBills.length === 0) {
      return { allowed: true };
    }

    if (!adminCanDeleteOthers) {
      const disallowedBills = othersBills.map(bill => bill.billNo);
      return {
        allowed: false,
        reason: `Admin permission to delete other users' bills is disabled. Cannot delete: ${disallowedBills.join(', ')}`,
        disallowedBills
      };
    }

    return { allowed: true };
  } catch (error) {
    console.error('Error checking bulk bill deletion permission:', error);
    return { allowed: false, reason: 'Error checking permissions' };
  }
}
