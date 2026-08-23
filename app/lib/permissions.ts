import { prisma } from './db';


import { agreementMatchesZone } from './railway-division-helper';
import { getAdministeringZone, contractIdsAdministeredBy, contractIdsTransferredAwayFrom } from './jurisdiction';

/**
 * Railway staff who see their own zone's work: the executive (engineering) side and
 * the accounts/audit office, which vets the proposal after the executive approves it.
 * Both get read access within their zone and neither can edit a contractor's papers.
 */
function isZoneScopedOfficial(role?: string | null): boolean {
  return role === 'railway_official' || role === 'accounts_official';
}



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

    if (isZoneScopedOfficial(user?.role)) {
      // A contract that has been transferred is administered by its new zone, whatever
      // its agreement number still says (lib/jurisdiction.ts). Null means never moved,
      // and the agreement number decides — exactly as before.
      const administeringZone = await getAdministeringZone(contractId);
      const inZone = administeringZone
        ? administeringZone === (user.railwayZone || '').trim().toUpperCase()
        : agreementMatchesZone(contract.agreementNo, user.railwayZone);
      if (inZone) {
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
        status: true,
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

    if (isZoneScopedOfficial(user?.role)) {
      // A draft is the contractor's working copy — unfinished, possibly wrong, and nobody
      // else's business until they submit it. Zone access starts at submission.
      if (bill.status === 'draft') return null;
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

    if (isZoneScopedOfficial(user?.role)) {
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
      const [zoneCandidates, transferredIn, transferredOut] = await Promise.all([
        prisma.contract.findMany({
          where: {
            agreementNo: {
              startsWith: `${user.railwayZone}/`,
              mode: 'insensitive'
            }
          },
          select: { id: true, agreementNo: true }
        }),
        // Contracts moved INTO this zone by a jurisdiction transfer, whatever their
        // agreement number says; and ones moved OUT, which the number alone would still
        // admit. Both empty until the transfer columns are applied (lib/jurisdiction.ts).
        contractIdsAdministeredBy(user.railwayZone),
        contractIdsTransferredAwayFrom(user.railwayZone),
      ]);
      const zoneContracts = zoneCandidates
        .filter(c => agreementMatchesZone(c.agreementNo, user.railwayZone))
        .filter(c => !transferredOut.has(c.id));
      return [...new Set([...ownedContracts.map(c => c.id), ...zoneContracts.map(c => c.id), ...transferredIn])];
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

    if (isZoneScopedOfficial(user?.role)) {
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
          ? prisma.bill.findMany({
            // Drafts stay with the contractor. Zone access starts at submission — the
            // same rule checkUserBillAccess applies to a single bill. Bills on their
            // OWN contracts are fetched separately above and keep their drafts.
            where: { zone: user.railwayZone, status: { not: 'draft' } },
            select: { id: true },
          })
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

// ─────────────────────────────────────────────────────────────────────────────────────
// Access as a database condition, not a list of ids.
//
// getUserAccessibleBills above answers "which bills may this person see?" with an
// array of ids — every one of them — which the bills list then pages with
// `id IN (…)`. So opening page 1 of 25 first reads every bill the person can access,
// and because an IN-list cannot use the date index, Postgres sorts them all as well.
// Fine at a hundred bills; a wall at ten thousand.
//
// billAccessWhere answers the same question with a Prisma `where` fragment — the same
// rules, expressed as a condition the database evaluates while it pages. The rules are
// transcribed from getUserAccessibleBills and checkUserBillAccess, not rewritten:
//
//   admin / superadmin      → null (unrestricted: callers apply no filter, as today)
//   zone official, zone set → own contracts' bills (drafts included)
//                             OR bills in the zone that are not drafts
//   zone official, no zone  → own contracts' bills only
//   everyone else           → own contracts' bills
//                             OR bills on contracts shared with them (live share)
//                             OR bills shared with them directly (live share)
//
// "Live share" is the existing rule, copied exactly: active, canView, and either no
// expiry or an expiry still in the future.
//
// ONE THING TO READ TWICE. The old function fails closed: any error returns [], an
// empty list, which denies everything. The natural "empty" Prisma filter is {} — which
// means the OPPOSITE: no restriction at all. A caught error that returned {} would
// hand every bill in the system to whoever asked. So on failure this returns
// DENY_ALL, an impossible predicate, and null keeps its single meaning of "admin,
// unrestricted", returned from exactly one place.
// ─────────────────────────────────────────────────────────────────────────────────────

/** A predicate no row satisfies. The failure value: it denies, as the old [] denied. */
export const DENY_ALL_BILLS = { id: { in: [] as string[] } } as const;

/** The existing share rule, as a where-fragment on UserBillAccess / UserContractAccess. */
function liveShare(userId: string, now: Date) {
  return {
    userId,
    isActive: true,
    canView: true,
    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
  };
}

export async function billAccessWhere(userId: string): Promise<Record<string, any> | null> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, railwayZone: true },
    });

    if (user?.role === 'admin' || user?.role === 'superadmin') {
      return null; // the one and only "unrestricted"
    }

    if (isZoneScopedOfficial(user?.role)) {
      // Own contracts keep their drafts; zone access starts at submission — the same
      // two rules checkUserBillAccess applies to a single bill.
      if (!user?.railwayZone) return { contract: { userId } };
      return {
        OR: [
          { contract: { userId } },
          { zone: user.railwayZone, status: { not: 'draft' } },
        ],
      };
    }

    const now = new Date();
    return {
      OR: [
        { contract: { userId } },
        { contract: { userAccess: { some: liveShare(userId, now) } } },
        { userAccess: { some: liveShare(userId, now) } },
      ],
    };
  } catch (error) {
    console.error('billAccessWhere failed — denying:', error);
    return DENY_ALL_BILLS;
  }
}

/**
 * Phase-2 safety net: run the OLD id-list and the NEW predicate for the same person
 * and record whether they agree, without changing what the person is shown.
 *
 * The predicate above is a transcription of rules that decide who may see whose money,
 * and a transcription can be wrong in ways that read correctly. This compares the two
 * answers on real accounts and real data for a while. Silence is the evidence needed
 * to delete the old path; any difference is a bug found before it could matter.
 *
 * It is cheap to be wrong here and expensive to be wrong there, so this swallows its
 * own errors: a failure in the check must never fail the request it rides along on.
 * Runs in the background after the list has been served; on Vercel the caller wraps it
 * in after() so the function stays alive for it.
 */
export async function compareBillAccessPaths(userId: string, label: string): Promise<void> {
  try {
    const [oldIds, where] = await Promise.all([getUserAccessibleBills(userId), billAccessWhere(userId)]);

    // Both say "admin, unrestricted"?
    if (oldIds === null || where === null) {
      if (oldIds !== null || where !== null) {
        await recordAccessMismatch(userId, label, 'one path says unrestricted, the other does not', { oldIsNull: oldIds === null, newIsNull: where === null });
      }
      return;
    }

    const newRows = await prisma.bill.findMany({ where, select: { id: true } });
    const newIds = new Set(newRows.map(b => b.id));
    const oldSet = new Set(oldIds);
    const onlyOld = oldIds.filter(id => !newIds.has(id));
    const onlyNew = [...newIds].filter(id => !oldSet.has(id));

    if (onlyOld.length === 0 && onlyNew.length === 0) return;
    await recordAccessMismatch(userId, label, `old path sees ${oldIds.length}, new sees ${newIds.size}`, {
      onlyOld: onlyOld.slice(0, 20),
      onlyNew: onlyNew.slice(0, 20),
      onlyOldCount: onlyOld.length,
      onlyNewCount: onlyNew.length,
    });
  } catch (error) {
    console.error('compareBillAccessPaths failed (ignored):', error);
  }
}

/**
 * Mismatches land in AdminSettings under a stable key, newest first, capped — a table
 * that exists, needs no DDL, and the admin can read. Also logged, so Vercel keeps it.
 */
async function recordAccessMismatch(userId: string, label: string, summary: string, detail: Record<string, unknown>) {
  const entry = { at: new Date().toISOString(), userId, label, summary, detail };
  console.warn('[access-compare] MISMATCH', JSON.stringify(entry));
  try {
    const key = 'access_compare_mismatches';
    const existing = await prisma.adminSettings.findUnique({ where: { key }, select: { value: true } });
    let list: unknown[] = [];
    try { list = existing?.value ? JSON.parse(existing.value) : []; } catch { list = []; }
    if (!Array.isArray(list)) list = [];
    list.unshift(entry);
    list = list.slice(0, 50);
    await prisma.adminSettings.upsert({
      where: { key },
      update: { value: JSON.stringify(list) },
      create: { key, value: JSON.stringify(list), description: 'Bill access: disagreements between the old id-list and the new predicate (phase-2 check)' },
    });
  } catch (error) {
    console.error('[access-compare] could not record mismatch:', error);
  }
}
