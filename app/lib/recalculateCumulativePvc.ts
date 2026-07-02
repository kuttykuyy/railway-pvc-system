import { prisma } from '@/lib/db';
import { buildCumulativePvcSummaries } from '@/lib/pdf/cumulative-pvc';

/**
 * Recalculates cumulative PVC for all bills in a contract
 * Bills are sorted by measurement date (oldest first) and cumulative PVC
 * is calculated as the running sum of all bills up to that point.
 * 
 * @param contractId - The ID of the contract
 * @returns Promise<void>
 */
export async function recalculateCumulativePvcForContract(contractId: string): Promise<void> {
  // Fetch all bills for the contract, sorted by measurement date (oldest first)
  const bills = await prisma.bill.findMany({
    where: { contractId },
    include: { pvcCalculation: true },
    orderBy: [
      { dateOfMeasurement: 'asc' },
      { createdAt: 'asc' },
      { id: 'asc' }
    ]
  });

  const cumulativeSummaries = buildCumulativePvcSummaries(bills);
  
  for (const bill of bills) {
    const summary = cumulativeSummaries.get(bill.id);
    if (bill.pvcCalculation && summary) {
      await prisma.pvcCalculation.update({
        where: { id: bill.pvcCalculation.id },
        data: {
          previousPvcTotal: summary.previousPvcTotal,
          cumulativePvc: summary.cumulativePvc
        }
      });
    }
  }
}

/**
 * Recalculates cumulative PVC for a specific bill and all subsequent bills
 * This is more efficient than recalculating for the entire contract when
 * only one bill changes.
 * 
 * @param billId - The ID of the bill that was modified
 * @returns Promise<void>
 */
export async function recalculateCumulativePvcFromBill(billId: string): Promise<void> {
  // Get the bill to find its contract and measurement date
  const bill = await prisma.bill.findUnique({
    where: { id: billId },
    include: { pvcCalculation: true }
  });

  if (!bill) {
    throw new Error(`Bill with ID ${billId} not found`);
  }

  // Recalculate for the entire contract to ensure consistency
  // (This handles cases where bills are added out of order)
  await recalculateCumulativePvcForContract(bill.contractId);
}
