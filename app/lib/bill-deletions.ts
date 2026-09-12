import { prisma } from './db';
import { schemaQualified } from './db-schema';

/**
 * A record of every bill deletion, kept after the bill itself is gone.
 *
 * Bills are hard-deleted, so "a user created a bill and deleted it" left no trace: not
 * who, not when, not whether it was the free-trial bill, not how old it was. The admin
 * saw a "new bill" ping and then nothing. This row survives the delete and the admin is
 * pinged on Telegram at the moment it happens, with the facts that matter for judging
 * it: was it free, how long did it live, who deleted it.
 *
 * Best-effort and never throws: the delete must go through even if the log cannot be
 * written. Raw SQL because the table ships through Pending DB Changes.
 */
export interface BillDeletionRecord {
  billId: string;
  billNo: string | null;
  contractId: string | null;
  agreementNo: string | null;
  /** The account the bill belonged to. */
  ownerUserId: string | null;
  ownerEmail: string | null;
  /** Who pressed delete — the owner, or an admin. */
  deletedByUserId: string;
  deletedByEmail: string | null;
  deletedByRole: string | null;
  wasFree: boolean;
  /** 'trial' | 'admin' | 'free_account' | 'custom_zero_fee' | null for a paid bill. */
  freeReason: string | null;
  chargedAmount: number;
  billAmount: number | null;
  totalPvc: number | null;
  dateOfMeasurement: Date | null;
  billCreatedAt: Date | null;
}

export async function recordBillDeletion(r: BillDeletionRecord): Promise<void> {
  const ageMinutes = r.billCreatedAt ? Math.max(0, Math.round((Date.now() - r.billCreatedAt.getTime()) / 60000)) : null;
  try {
    const table = await schemaQualified('bill_deletions');
    await prisma.$executeRawUnsafe(
      `INSERT INTO ${table} ("billId", "billNo", "contractId", "agreementNo", "ownerUserId", "ownerEmail",
         "deletedByUserId", "deletedByEmail", "deletedByRole", "wasFree", "freeReason", "chargedAmount",
         "billAmount", "totalPvc", "dateOfMeasurement", "billCreatedAt", "ageMinutes")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
      r.billId, r.billNo, r.contractId, r.agreementNo, r.ownerUserId, r.ownerEmail,
      r.deletedByUserId, r.deletedByEmail, r.deletedByRole, r.wasFree, r.freeReason, r.chargedAmount,
      r.billAmount, r.totalPvc, r.dateOfMeasurement, r.billCreatedAt, ageMinutes,
    );
  } catch (err) {
    console.error('bill-deletions: could not record (table not applied yet?):', err);
  }

  try {
    const { notifyTelegramAdmin } = await import('./telegram-api');
    const age = ageMinutes === null ? 'unknown age'
      : ageMinutes < 60 ? `${ageMinutes} min old`
      : ageMinutes < 48 * 60 ? `${Math.round(ageMinutes / 60)} h old`
      : `${Math.round(ageMinutes / 1440)} days old`;
    const money = r.wasFree ? `FREE (${r.freeReason || 'free'})` : `paid ₹${Math.round(r.chargedAmount)}`;
    const byWhom = r.deletedByUserId === r.ownerUserId ? 'by the owner' : `by ${r.deletedByEmail || r.deletedByRole || 'admin'}`;
    // A young free-trial bill going is the pattern worth a second look; say so up front.
    const flag = r.wasFree && ageMinutes !== null && ageMinutes < 24 * 60 ? '⚠️ ' : '';
    await notifyTelegramAdmin(
      `${flag}🗑️ Bill deleted ${byWhom}\n` +
      `User: ${r.ownerEmail || r.ownerUserId || '(unknown)'}\n` +
      `Agreement: ${r.agreementNo || '(none)'} · Bill ${r.billNo || '?'}\n` +
      `${money} · ${age}` +
      (r.totalPvc !== null ? ` · PVC ₹${Math.round(r.totalPvc).toLocaleString('en-IN')}` : '') +
      `\n\nHistory: Admin → Checks → Bill deletions.`,
    );
  } catch (err) {
    console.error('bill-deletions: telegram alert failed:', err);
  }
}
