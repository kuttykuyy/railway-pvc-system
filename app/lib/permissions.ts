
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface UserPermissions {
  canView: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canCreateBills?: boolean; // For contracts
  canDownloadPdf?: boolean; // For bills
}

export async function checkUserContractAccess(
  userId: string,
  contractId: string
): Promise<UserPermissions | null> {
  try {
    // Check if user is admin
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true }
    });

    if (user?.role === 'admin') {
      // Admin has full access to everything
      return {
        canView: true,
        canEdit: true,
        canDelete: true,
        canCreateBills: true
      };
    }

    // Check if user is the contract owner
    const contract = await prisma.contract.findUnique({
      where: { id: contractId },
      select: { userId: true }
    });

    if (contract?.userId === userId) {
      // Owner has full access
      return {
        canView: true,
        canEdit: true,
        canDelete: true,
        canCreateBills: true
      };
    }

    // Check explicit permission
    const access = await prisma.userContractAccess.findUnique({
      where: {
        userId_contractId: {
          userId,
          contractId
        }
      },
      select: {
        canView: true,
        canEdit: true,
        canDelete: true,
        canCreateBills: true,
        expiresAt: true,
        isActive: true
      }
    });

    if (!access || !access.isActive) {
      return null;
    }

    // Check if access has expired
    if (access.expiresAt && new Date(access.expiresAt) < new Date()) {
      return null;
    }

    return {
      canView: access.canView,
      canEdit: access.canEdit,
      canDelete: access.canDelete,
      canCreateBills: access.canCreateBills
    };
  } catch (error) {
    console.error('Error checking contract access:', error);
    return null;
  }
}

export async function checkUserBillAccess(
  userId: string,
  billId: string
): Promise<UserPermissions | null> {
  try {
    // Check if user is admin
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true }
    });

    if (user?.role === 'admin') {
      // Admin has full access to everything
      return {
        canView: true,
        canEdit: true,
        canDelete: true,
        canDownloadPdf: true
      };
    }

    // Get bill with contract info
    const bill = await prisma.bill.findUnique({
      where: { id: billId },
      include: {
        contract: {
          select: { userId: true, id: true }
        }
      }
    });

    if (!bill) {
      return null;
    }

    // Check if user is the contract owner
    if (bill.contract.userId === userId) {
      // Owner has full access to all bills under their contracts
      return {
        canView: true,
        canEdit: true,
        canDelete: true,
        canDownloadPdf: true
      };
    }

    // Check explicit bill permission
    const billAccess = await prisma.userBillAccess.findUnique({
      where: {
        userId_billId: {
          userId,
          billId
        }
      },
      select: {
        canView: true,
        canEdit: true,
        canDelete: true,
        canDownloadPdf: true,
        expiresAt: true,
        isActive: true
      }
    });

    if (billAccess && billAccess.isActive) {
      // Check if access has expired
      if (billAccess.expiresAt && new Date(billAccess.expiresAt) < new Date()) {
        return null;
      }

      return {
        canView: billAccess.canView,
        canEdit: billAccess.canEdit,
        canDelete: billAccess.canDelete,
        canDownloadPdf: billAccess.canDownloadPdf
      };
    }

    // Check contract access (bills inherit contract permissions)
    const contractAccess = await checkUserContractAccess(userId, bill.contract.id);
    
    if (contractAccess?.canView) {
      return {
        canView: contractAccess.canView,
        canEdit: contractAccess.canEdit,
        canDelete: contractAccess.canDelete,
        canDownloadPdf: true // Default to true if they have contract access
      };
    }

    return null;
  } catch (error) {
    console.error('Error checking bill access:', error);
    return null;
  }
}

export async function getUserAccessibleContracts(userId: string): Promise<string[]> {
  try {
    // Check if user is admin
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true }
    });

    if (user?.role === 'admin') {
      // Admin can access all contracts
      const allContracts = await prisma.contract.findMany({
        select: { id: true }
      });
      return allContracts.map(c => c.id);
    }

    // Get owned contracts
    const ownedContracts = await prisma.contract.findMany({
      where: { userId },
      select: { id: true }
    });

    // Get contracts with explicit access
    const explicitAccess = await prisma.userContractAccess.findMany({
      where: {
        userId,
        isActive: true,
        canView: true,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } }
        ]
      },
      select: { contractId: true }
    });

    const accessibleContractIds = [
      ...ownedContracts.map(c => c.id),
      ...explicitAccess.map(a => a.contractId)
    ];

    return [...new Set(accessibleContractIds)]; // Remove duplicates
  } catch (error) {
    console.error('Error getting accessible contracts:', error);
    return [];
  }
}

export async function getUserAccessibleBills(userId: string): Promise<string[]> {
  try {
    // Check if user is admin
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true }
    });

    if (user?.role === 'admin') {
      // Admin can access all bills
      const allBills = await prisma.bill.findMany({
        select: { id: true }
      });
      return allBills.map(b => b.id);
    }

    // Get accessible contracts first
    const accessibleContractIds = await getUserAccessibleContracts(userId);

    // Get all bills from accessible contracts
    const contractBills = await prisma.bill.findMany({
      where: {
        contractId: {
          in: accessibleContractIds
        }
      },
      select: { id: true }
    });

    // Get bills with explicit access
    const explicitAccess = await prisma.userBillAccess.findMany({
      where: {
        userId,
        isActive: true,
        canView: true,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } }
        ]
      },
      select: { billId: true }
    });

    const accessibleBillIds = [
      ...contractBills.map(b => b.id),
      ...explicitAccess.map(a => a.billId)
    ];

    return [...new Set(accessibleBillIds)]; // Remove duplicates
  } catch (error) {
    console.error('Error getting accessible bills:', error);
    return [];
  }
}
