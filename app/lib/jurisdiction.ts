/**
 * Which railway zone ADMINISTERS a contract, when that is no longer the zone its
 * agreement number names.
 *
 * Why this exists: Railway Board order 2025/E&R/1(3)/1 (21 Aug 2026) moves the
 * Mangaluru area from Southern Railway's Palakkad division to South Western Railway's
 * Mysuru division from 1 October 2026. The contracts do not get new agreement numbers —
 * an "SR/PGT/…" number stays "SR/PGT/…" for the life of the work — they are simply run
 * by a different division from that date. The app decides a contract's zone from its
 * agreement number, so without this it would keep showing those contracts to SR
 * officials and hiding them from SWR ones, quietly, forever.
 *
 * The money is unaffected: SR and SWR both price steel on Chennai (GCC-2022
 * Cl.46A.9(2)), so a transferred contract's PVC figures do not change. This is about
 * who may see what, and about the record of the move.
 *
 * Storage: two columns on contracts, `administeringZone` (null = "as the agreement
 * number says") and `jurisdictionTransfers` (the history). Both ship through Pending DB
 * Changes and are read and written here by raw SQL ON PURPOSE: declaring a column in
 * schema.prisma before the database has it takes unrelated queries down with it, and
 * this codebase has paid for that twice. Every read here tolerates the columns not
 * existing yet — it answers "not transferred" — so the feature is inert until applied,
 * and the permission rules fall back to the agreement number exactly as before.
 */

import { prisma } from './db';
import { schemaQualified } from './db-schema';

export interface JurisdictionTransfer {
  /** ISO timestamp of the action. */
  at: string;
  /** Zone the contract was administered by before (agreement-number zone if never moved). */
  fromZone: string | null;
  toZone: string;
  /** Free text, e.g. "Mysuru (MYS)". */
  toDivision?: string | null;
  /** The order it was made under, e.g. "RB 2025/E&R/1(3)/1 dtd 21-8-2026". */
  orderRef: string;
  /** When the change takes effect, as written in the order (informational). */
  effectiveDate?: string | null;
  note?: string | null;
  byUserEmail: string | null;
  /** How many bills were restamped to the new zone. */
  billsRestamped: number;
}

/**
 * The administering zone of one contract, or null when it has never been moved (or the
 * column is not applied yet). Callers fall back to the agreement number on null.
 */
export async function getAdministeringZone(contractId: string): Promise<string | null> {
  try {
    const t = await schemaQualified('contracts');
    const rows = await prisma.$queryRawUnsafe<Array<{ administeringZone: string | null }>>(
      `SELECT "administeringZone" FROM ${t} WHERE id = $1`, contractId,
    );
    return rows[0]?.administeringZone || null;
  } catch {
    return null; // column not applied yet — behave as before the feature existed
  }
}

/** Ids of every contract transferred TO this zone. Empty until the column is applied. */
export async function contractIdsAdministeredBy(zone: string): Promise<string[]> {
  try {
    const t = await schemaQualified('contracts');
    const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM ${t} WHERE "administeringZone" = $1`, zone.trim().toUpperCase(),
    );
    return rows.map(r => r.id);
  } catch {
    return [];
  }
}

/** Ids of every contract transferred AWAY from the zone its agreement number names. */
export async function contractIdsTransferredAwayFrom(zone: string): Promise<Set<string>> {
  try {
    const t = await schemaQualified('contracts');
    const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM ${t} WHERE "administeringZone" IS NOT NULL AND "administeringZone" <> $1`,
      zone.trim().toUpperCase(),
    );
    return new Set(rows.map(r => r.id));
  } catch {
    return new Set();
  }
}

/** Every transferred contract with its history, for the admin screen. */
export async function listTransferredContracts(): Promise<Array<{
  id: string; agreementNo: string; contractorName: string; administeringZone: string;
  jurisdictionTransfers: JurisdictionTransfer[];
}>> {
  try {
    const t = await schemaQualified('contracts');
    const rows = await prisma.$queryRawUnsafe<Array<any>>(
      `SELECT id, "agreementNo", "contractorName", "administeringZone", "jurisdictionTransfers"
         FROM ${t} WHERE "administeringZone" IS NOT NULL ORDER BY "agreementNo"`,
    );
    return rows.map(r => ({
      ...r,
      jurisdictionTransfers: Array.isArray(r.jurisdictionTransfers) ? r.jurisdictionTransfers : [],
    }));
  } catch {
    return [];
  }
}

/** Whether the two columns exist — the admin screen says "apply Pending DB Changes" if not. */
export async function jurisdictionColumnsReady(): Promise<boolean> {
  try {
    const t = await schemaQualified('contracts');
    await prisma.$queryRawUnsafe(`SELECT "administeringZone", "jurisdictionTransfers" FROM ${t} LIMIT 0`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Move one contract to a new administering zone and restamp its bills.
 *
 * The bills are restamped because every bill-level rule — the officials' list, the
 * accounts inbox, the single-bill check — reads bill.zone. Leaving them would move the
 * contract and strand its bills. The fuel-price basis is untouched: a bill priced on
 * the four-city average stays so; one priced on a zone city keeps its stored figure,
 * and a regenerate would use the new zone's city, which for SR→SWR is the same Chennai.
 *
 * Raw SQL for the contract columns (see the module note); Prisma for the bills, whose
 * `zone` has always been a declared field. Both in one transaction so a failure leaves
 * the contract exactly as it was.
 */
export async function transferContractJurisdiction(args: {
  contractId: string;
  toZone: string;
  toDivision?: string | null;
  orderRef: string;
  effectiveDate?: string | null;
  note?: string | null;
  byUserEmail: string | null;
}): Promise<{ ok: true; entry: JurisdictionTransfer } | { ok: false; error: string }> {
  const toZone = args.toZone.trim().toUpperCase();
  if (!toZone) return { ok: false, error: 'A destination zone is required.' };
  if (!args.orderRef?.trim()) return { ok: false, error: 'The order reference is required — the transfer must say what it was made under.' };

  const t = await schemaQualified('contracts');
  const contract = await prisma.contract.findUnique({
    where: { id: args.contractId },
    select: { id: true, agreementNo: true },
  });
  if (!contract) return { ok: false, error: 'Contract not found.' };

  const current = await getAdministeringZone(contract.id);
  const agreementZone = contract.agreementNo.split('/')[0]?.trim().toUpperCase() || null;
  const fromZone = current || agreementZone;
  if (fromZone === toZone) return { ok: false, error: `${contract.agreementNo} is already administered by ${toZone}.` };

  try {
    const entry = await prisma.$transaction(async (tx) => {
      const restamped = await tx.bill.updateMany({ where: { contractId: contract.id }, data: { zone: toZone } });
      const e: JurisdictionTransfer = {
        at: new Date().toISOString(),
        fromZone,
        toZone,
        toDivision: args.toDivision?.trim() || null,
        orderRef: args.orderRef.trim(),
        effectiveDate: args.effectiveDate || null,
        note: args.note?.trim() || null,
        byUserEmail: args.byUserEmail,
        billsRestamped: restamped.count,
      };
      await tx.$executeRawUnsafe(
        `UPDATE ${t}
            SET "administeringZone" = $1,
                "jurisdictionTransfers" = COALESCE("jurisdictionTransfers", '[]'::jsonb) || $2::jsonb
          WHERE id = $3`,
        toZone, JSON.stringify([e]), contract.id,
      );
      return e;
    }, { timeout: 20_000 });
    return { ok: true, entry };
  } catch (error: any) {
    const msg = String(error?.message || error);
    if (/administeringZone|jurisdictionTransfers/.test(msg) && /does not exist|column/i.test(msg)) {
      return { ok: false, error: 'The database columns for this are not applied yet — Admin → System → Pending DB changes → Apply, then try again.' };
    }
    return { ok: false, error: msg };
  }
}
