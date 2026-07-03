import { prisma } from './db';


import { agreementMatchesZone } from './railway-division-helper';



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
      select: { role: true, railwayZone: true }
    });

    if (user?.role === 'admin' || user?.role === 'superadmin') {
      // Admin has full access to everything
      return {
        canView: true,
        canEdit: true,
        canDelete: true,
        canCreateBills: true
      };
    }

    // Check if contract exists
    const contract = await prisma.contract.findUnique({
      where: { id: contractId },
      select: { userId: true, agreementNo: true }
    });

    if (!contract) {
      return null;
    }

    // Owner always gets full access, regardless of role
    if (contract.userId === userId) {
      return {
        canView: true,
        canEdit: true,
        canDelete: true,
        canCreateBills: true
      };
    }

    if (user?.role === 'railway_official') {
      // Access allowed if contract zone matches official's zone
      if (agreementMatchesZone(contract.agreementNo, user.railwayZone)) {
        return {
          canView: true,
          canEdit: false,
          canDelete: false,
          canCreateBills: false
        };
      }
      return null;
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
      select: { role: true, railwayZone: true }
    });

    if (user?.role === 'admin' || user?.role === 'superadmin') {
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
      select: {
        id: true,
        zone: true,
        contract: {
          select: { id: true, userId: true }
        }
      }
    });

    if (!bill) {
      return null;
    }

    // Contract owner always gets full access, regardless of role
    if (bill.contract.userId === userId) {
      return {
        canView: true,
        canEdit: true,
        canDelete: true,
        canDownloadPdf: true
      };
    }

    if (user?.role === 'railway_official') {
      // Access allowed if bill's zone matches official's zone
      if (bill.zone && user.railwayZone && bill.zone.toUpperCase() === user.railwayZone.toUpperCase()) {
        return {
          canView: true,
          canEdit: false,
          canDelete: false,
          canDownloadPdf: true
        };
      }
      return null;
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

/**
 * Returns accessible contract IDs for a user.
 * Returns null for admins (meaning: unrestricted — callers must handle null
 * by skipping the ID filter and querying all contracts directly).
 * This avoids loading 100k+ IDs into Node.js memory at scale.
 */
export async function getUserAccessibleContracts(userId: string): Promise<string[] | null> {
  try {
    // Check if user is admin or official
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, railwayZone: true }
    });

    if (user?.role === 'admin' || user?.role === 'superadmin') {
      // null = unrestricted access — do NOT fetch all IDs (memory cliff at scale)
      return null;
    }

    if (user?.role === 'railway_official') {
      // Always include contracts owned by this user
      const ownedContracts = await prisma.contract.findMany({
        where: { userId },
        select: { id: true }
      });

      if (!user.railwayZone) {
        return ownedContracts.map(c => c.id);
      }
      // Official can access all contracts matching their zone in the agreement number.
      // The DB `startsWith` is a coarse prefilter; the authoritative agreementMatchesZone
      // refinement keeps this consistent with checkUserContractAccess.
      const zoneCandidates = await prisma.contract.findMany({
        where: {
          agreementNo: {
            startsWith: `${user.railwayZone}/`,
            mode: 'insensitive'
          }
        },
        select: { id: true, agreementNo: true }
      });
      const zoneContracts = zoneCandidates.filter(c => agreementMatchesZone(c.agreementNo, user.railwayZone));
      return [...new Set([...ownedContracts.map(c => c.id), ...zoneContracts.map(c => c.id)])];
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

/**
 * Returns accessible bill IDs for a user.
 * Returns null for admins (meaning: unrestricted — callers skip the ID filter).
 */
export async function getUserAccessibleBills(userId: string): Promise<string[] | null> {
  try {
    // Check if user is admin or official
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, railwayZone: true }
    });

    if (user?.role === 'admin' || user?.role === 'superadmin') {
      return null; // unrestricted
    }

    if (user?.role === 'railway_official') {
      // Get owned contracts directly (avoids extra getUserAccessibleContracts call)
      const ownedContracts = await prisma.contract.findMany({
        where: { userId },
        select: { id: true }
      });
      const ownedContractIds = ownedContracts.map(c => c.id);

      // Run owned-contract bills and zone bills in parallel
      const [ownedContractBills, zoneBills] = await Promise.all([
        ownedContractIds.length > 0
          ? prisma.bill.findMany({ where: { contractId: { in: ownedContractIds } }, select: { id: true } })
          : Promise.resolve([]),
        user.railwayZone
          ? prisma.bill.findMany({ where: { zone: user.railwayZone }, select: { id: true } })
          : Promise.resolve([])
      ]);

      return [...new Set([...ownedContractBills.map(b => b.id), ...zoneBills.map(b => b.id)])];
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
