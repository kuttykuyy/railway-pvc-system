interface BillForCumulativePvc {
  id: string;
  contractId: string;
  billNo?: string | null;
  dateOfMeasurement: Date | string;
  createdAt: Date | string;
  pvcCalculation?: { totalPvc: number } | null;
}

function normalizedBillKey(bill: BillForCumulativePvc): string {
  const normalizedBillNo = String(bill.billNo || '').trim().toLowerCase().replace(/\s+/g, '');
  return `${bill.contractId}:${normalizedBillNo || bill.id}`;
}

function keepNewerBill(a: BillForCumulativePvc, b: BillForCumulativePvc): BillForCumulativePvc {
  const creationDifference = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  if (creationDifference !== 0) return creationDifference > 0 ? a : b;
  return a.id.localeCompare(b.id) > 0 ? a : b;
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
  const canonicalBills = new Map<string, BillForCumulativePvc>();

  // Legacy data can contain multiple rows for one logical bill. Count only the
  // newest row so a replaced bill cannot appear as its own previous PVC.
  for (const bill of bills) {
    const key = normalizedBillKey(bill);
    const existing = canonicalBills.get(key);
    canonicalBills.set(key, existing ? keepNewerBill(existing, bill) : bill);
  }

  for (const bill of [...canonicalBills.values()].sort(compareBills)) {
    const previousPvcTotal = runningByContract.get(bill.contractId) ?? 0;
    const totalPvc = bill.pvcCalculation?.totalPvc ?? 0;
    const cumulativePvc = previousPvcTotal + totalPvc;

    summaries.set(bill.id, { previousPvcTotal, cumulativePvc });
    runningByContract.set(bill.contractId, cumulativePvc);
  }

  // Give every legacy duplicate the canonical bill's summary as well. This
  // keeps direct downloads of an older row correct without counting it twice.
  for (const bill of bills) {
    const canonicalBill = canonicalBills.get(normalizedBillKey(bill));
    const canonicalSummary = canonicalBill ? summaries.get(canonicalBill.id) : undefined;
    if (canonicalSummary) summaries.set(bill.id, canonicalSummary);
  }

  return summaries;
}

export function compareBillsChronologically(
  a: BillForCumulativePvc,
  b: BillForCumulativePvc,
): number {
  return compareBills(a, b);
}
