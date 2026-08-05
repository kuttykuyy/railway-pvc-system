/**
 * Finding bills whose provisional indices have since been published as final.
 *
 * A bill calculated while an index was still provisional keeps that provisional figure
 * until somebody regenerates it. Nothing told the owner the real number had arrived, so
 * the only way to find out was to open the list and look — which is no way to run it.
 *
 * This finds them. It does NOT recalculate: the recalculation lives inside the
 * /api/bills/[id]/recalculate route handler, and a second implementation of it here is
 * exactly how the fuel basis, the steel page and the Regenerate button each ended up
 * disagreeing with themselves. Extracting that route into a shared function is the
 * prerequisite for doing this automatically, and is worth doing on its own.
 */

import { prisma } from './db';
import { getBillIndicesStatus, relevantIndexNamesForBill } from './index-status';

export interface AffectedBill {
  billId: string;
  billNo: string;
  agreementNo: string;
  quarter: string;
  status: string;
  ownerId: string;
  ownerName: string;
  ownerPhone: string | null;
  /** Indices that were provisional when this ran last and are final now. */
  finalisedIndices: string[];
  /** The PVC as currently saved, so a refresh can report what actually moved. */
  totalPvc: number;
}

/**
 * Bills still carrying provisional figures whose quarter has since gone fully final.
 *
 * Deliberately capped: a sweep that walks every bill ever created will eventually time
 * out on the cron, and the ones worth chasing are recent.
 */
export async function findBillsWithNewlyFinalIndices(limit = 200): Promise<AffectedBill[]> {
  const candidates = await prisma.bill.findMany({
    where: {
      pvcCalculation: { usedProvisionalIndices: true },
    },
    orderBy: { dateOfMeasurement: 'desc' },
    take: limit,
    select: {
      id: true,
      billNo: true,
      quarter: true,
      status: true,
      zone: true,
      fuelPriceType: true,
      pvcCalculation: { select: { totalPvc: true } },
      contract: {
        select: {
          agreementNo: true,
          baseMonth: true,
          user: { select: { id: true, name: true, email: true, phone: true } },
        },
      },
    },
  });

  // One status lookup per distinct question, not per bill — a contract's bills share a
  // quarter and a zone far more often than not.
  const statusCache = new Map<string, Awaited<ReturnType<typeof getBillIndicesStatus>>>();
  const affected: AffectedBill[] = [];

  for (const bill of candidates) {
    const names = relevantIndexNamesForBill(bill.zone, bill.fuelPriceType);
    const key = `${bill.quarter}::${bill.contract.baseMonth.toISOString()}::${names.sort().join('|')}`;
    if (!statusCache.has(key)) {
      statusCache.set(key, await getBillIndicesStatus(bill.quarter, bill.contract.baseMonth, names));
    }
    const status = statusCache.get(key)!;
    if (status.isProvisional) continue; // still waiting — nothing to tell anyone yet

    affected.push({
      billId: bill.id,
      billNo: bill.billNo,
      agreementNo: bill.contract.agreementNo,
      quarter: bill.quarter,
      status: bill.status || 'draft',
      ownerId: bill.contract.user?.id || '',
      ownerName: bill.contract.user?.name || bill.contract.user?.email || 'there',
      ownerPhone: bill.contract.user?.phone || null,
      finalisedIndices: status.finalIndices,
      totalPvc: bill.pvcCalculation?.totalPvc ?? 0,
    });
  }

  return affected;
}

/** Affected bills grouped by the person who needs to hear about them. */
export function groupByOwner(bills: AffectedBill[]): Map<string, AffectedBill[]> {
  const byOwner = new Map<string, AffectedBill[]>();
  for (const bill of bills) {
    if (!bill.ownerId) continue;
    byOwner.set(bill.ownerId, [...(byOwner.get(bill.ownerId) || []), bill]);
  }
  return byOwner;
}
