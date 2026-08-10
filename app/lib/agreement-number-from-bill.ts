/**
 * Filling in a contract's agreement number from its first bill.
 *
 * A contract set up from an LOA has no agreement number — the LOA is issued weeks
 * before the agreement is signed — so the LOA number stands in as the contract's
 * identifier. The bill prints the real agreement number, so the first bill uploaded
 * against such a contract can supply it.
 *
 * Whether the contract is still standing on its LOA number is judged on NORMALIZED
 * numbers, because the contract route normalizes the agreement number before storing
 * it (uppercased, segments stripped of spaces and stray marks) while the LOA number is
 * stored as typed. Compared raw, a contract created from an LOA looked as if it
 * already had an agreement number of its own, and the fill never ran.
 *
 * The bill's own LOA number is accepted as a second witness: where the contract's
 * loaNo field is blank — the number was typed straight into the agreement field —
 * but the bill prints an LOA number equal to the contract's identifier, that is the
 * same fact established from the other side.
 *
 * Deliberately narrow otherwise. It never acts when the bill prints nothing, never
 * repeats what is already there, and never takes a number another contract holds —
 * quietly merging two contracts because a bill was uploaded against the wrong one
 * would be far worse than leaving a placeholder.
 *
 * A PVC number already issued keeps the identifier it was built from: they are
 * generated as PVC/<agreementNo>/<seq> and are quoted on documents that have left the
 * building. This renames the contract, not its history.
 */
import { prisma } from './db';
import { normalizeAgreementNo } from './railway-division-helper';

export interface AgreementNumberFill {
  applied: boolean;
  from?: string;
  to?: string;
  /** Why nothing was done, when nothing was. */
  reason?: string;
  /** True when the number is held by another contract — worth telling the user. */
  conflict?: boolean;
}

const norm = (value: unknown): string => {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  return normalizeAgreementNo(raw) || raw.toUpperCase();
};

export async function fillAgreementNumberFromBill(
  contractId: string,
  billAgreementNo: string | undefined | null,
  billLoaNo?: string | undefined | null,
): Promise<AgreementNumberFill> {
  const printed = String(billAgreementNo || '').trim();
  if (!printed) return { applied: false, reason: 'The bill prints no agreement number.' };

  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    select: { id: true, agreementNo: true, loaNo: true },
  });
  if (!contract) return { applied: false, reason: 'Contract not found.' };

  const current = norm(contract.agreementNo);
  const contractLoa = norm(contract.loaNo);
  const billLoa = norm(billLoaNo);

  // Standing on the LOA number: either the contract says so itself, or the bill's own
  // printed LOA number equals the contract's identifier.
  const standsOnLoa = (contractLoa && current === contractLoa) || (billLoa && current === billLoa);
  if (!standsOnLoa) {
    return { applied: false, reason: 'The contract already has its own agreement number.' };
  }
  if (norm(printed) === current) {
    return { applied: false, reason: 'The bill prints the same number the contract holds.' };
  }

  // Stored normalized, exactly as the contract-create route stores one, so the two
  // paths can never disagree about what the same number looks like.
  const stored = normalizeAgreementNo(printed) || printed;
  const taken = await prisma.contract.findFirst({
    where: {
      OR: [
        { agreementNo: { equals: stored, mode: 'insensitive' } },
        { agreementNo: { equals: printed, mode: 'insensitive' } },
      ],
      NOT: { id: contractId },
    },
    select: { id: true },
  });
  if (taken) {
    return {
      applied: false,
      conflict: true,
      reason: `Another contract already holds agreement number ${printed}. Left unchanged — check the bill was uploaded against the right contract.`,
    };
  }

  await prisma.contract.update({
    where: { id: contractId },
    data: {
      agreementNo: stored,
      // The number the contract stood on is worth keeping: it is the LOA number, and
      // where the loaNo field was blank it would otherwise be lost in the rename.
      ...(String(contract.loaNo || '').trim() ? {} : { loaNo: String(contract.agreementNo || '').trim() }),
    },
  });
  return { applied: true, from: String(contract.agreementNo || ''), to: stored };
}
