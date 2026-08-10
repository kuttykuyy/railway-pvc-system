/**
 * Filling in a contract's agreement number from its first bill.
 *
 * A contract set up from an LOA has no agreement number — the LOA is issued weeks
 * before the agreement is signed — so the LOA number stands in as the contract's
 * identifier, and the two being equal is what marks it as awaited. The bill prints the
 * real agreement number, so the first bill uploaded against such a contract can supply
 * it.
 *
 * Deliberately narrow. It acts only on a contract still carrying its LOA number, only
 * when the bill prints something different, and never when another contract already
 * holds that number — the column is unique, and quietly merging two contracts because a
 * bill was uploaded against the wrong one would be far worse than leaving a placeholder.
 *
 * A PVC number already issued keeps the identifier it was built from: they are
 * generated as PVC/<agreementNo>/<seq> and are quoted on documents that have left the
 * building. This renames the contract, not its history.
 */
import { prisma } from './db';

export interface AgreementNumberFill {
  applied: boolean;
  from?: string;
  to?: string;
  /** Why nothing was done, when nothing was. */
  reason?: string;
}

export async function fillAgreementNumberFromBill(
  contractId: string,
  billAgreementNo: string | undefined | null,
): Promise<AgreementNumberFill> {
  const printed = String(billAgreementNo || '').trim();
  if (!printed) return { applied: false, reason: 'The bill prints no agreement number.' };

  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    select: { id: true, agreementNo: true, loaNo: true },
  });
  if (!contract) return { applied: false, reason: 'Contract not found.' };

  const current = String(contract.agreementNo || '').trim();
  const loa = String(contract.loaNo || '').trim();

  // Only a contract still standing on its LOA number is waiting for this.
  if (!loa || current.toUpperCase() !== loa.toUpperCase()) {
    return { applied: false, reason: 'The contract already has its own agreement number.' };
  }
  if (printed.toUpperCase() === current.toUpperCase()) {
    return { applied: false, reason: 'The bill prints the same number the contract holds.' };
  }

  const taken = await prisma.contract.findFirst({
    where: { agreementNo: { equals: printed, mode: 'insensitive' }, NOT: { id: contractId } },
    select: { id: true },
  });
  if (taken) {
    return {
      applied: false,
      reason: `Another contract already holds agreement number ${printed}. Left unchanged — check the bill was uploaded against the right contract.`,
    };
  }

  await prisma.contract.update({ where: { id: contractId }, data: { agreementNo: printed } });
  return { applied: true, from: current, to: printed };
}
