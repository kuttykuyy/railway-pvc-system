interface BillForCumulativePvc {
  id: string;
  contractId: string;
  dateOfMeasurement: Date | string;
  createdAt: Date | string;
  pvcCalculation?: { totalPvc: number } | null;
}

export interface CumulativePvcSummary {
  previousPvcTotal: number;
  cumulativePvc: number;
}

function compareBills(a: BillForCumulativePvc, b: BillForCumulativePvc): number {
  const measurementDifference = new Date(a.dateOfMeasurement).getTime()
    - new Date(b.dateOfMeasurement).getTime();
  if (measurementDifference !== 0) return measurementDifference;

  const creationDifference = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  if (creationDifference !== 0) return creationDifference;

  return a.id.localeCompare(b.id);
}

/** Builds cumulative PVC from the bills that currently exist for each contract. */
export function buildCumulativePvcSummaries(
  bills: BillForCumulativePvc[],
): Map<string, CumulativePvcSummary> {
  const runningByContract = new Map<string, number>();
  const summaries = new Map<string, CumulativePvcSummary>();

  for (const bill of [...bills].sort(compareBills)) {
    const previousPvcTotal = runningByContract.get(bill.contractId) ?? 0;
    const totalPvc = bill.pvcCalculation?.totalPvc ?? 0;
    const cumulativePvc = previousPvcTotal + totalPvc;

    summaries.set(bill.id, { previousPvcTotal, cumulativePvc });
    runningByContract.set(bill.contractId, cumulativePvc);
  }

  return summaries;
}

export function compareBillsChronologically(
  a: BillForCumulativePvc,
  b: BillForCumulativePvc,
): number {
  return compareBills(a, b);
}
