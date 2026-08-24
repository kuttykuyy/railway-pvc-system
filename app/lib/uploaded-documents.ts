import crypto from 'crypto';
import { prisma } from './db';
import { schemaQualified } from './db-schema';
import { logger } from './logger';

/**
 * The bill and LOA PDFs people upload, kept for a while instead of thrown away.
 *
 * Until now an upload was read for its numbers and dropped. That cost three things:
 * a bill could not be re-read when the reader improved, nobody could show an auditor
 * the document a figure came from, and every support question about a wrong figure
 * began with "please send us the PDF again". Only FAILURES were kept (parse_failures),
 * which is the one case where the file is least useful.
 *
 * Two deliberate limits:
 *
 *   1. Ninety days, then gone. These are commercial agreements and running bills, not
 *      our records. Ninety days covers re-extraction, a disputed figure and a support
 *      thread; past that, holding someone's contract documents earns nothing and costs
 *      trust. The nightly cron sweeps by "expiresAt", and deleting a bill or contract
 *      orphans its document, which the same sweep removes early.
 *
 *   2. It never throws. Storing the file is a side benefit of an upload that has
 *      already succeeded; a bucket outage must not turn a working extraction into an
 *      error on the user's screen. Every function here returns null or false instead.
 *
 * Raw SQL because the table ships through Pending DB Changes. A field declared in
 * schema.prisma before the database has the table takes unrelated queries down with it
 * (P2022), which is a lesson this codebase has already paid for twice.
 */

/** How long an upload is kept before the nightly sweep removes it. */
export const DOCUMENT_RETENTION_DAYS = 90;

/**
 * How long a document waits to be attached to a bill or contract. Extraction happens
 * before the bill exists, so a file is stored unlinked and claimed a few minutes later
 * when the user saves. Abandoned drafts never claim theirs — those are just litter, and
 * a week is far longer than anyone spends on the form.
 */
export const UNLINKED_GRACE_DAYS = 7;

export type DocumentKind = 'bill' | 'agreement';

export interface StoredDocument {
  id: number;
  kind: DocumentKind;
  billId: string | null;
  contractId: string | null;
  userId: string | null;
  fileName: string;
  contentType: string;
  byteSize: number;
  createdAt: Date;
  expiresAt: Date;
  storagePath: string | null;
  note: string | null;
}

const table = () => schemaQualified('uploaded_documents');

/**
 * A bucket object key that says who it belongs to and when it was taken. Not a
 * secret — the row is permission-checked before anyone is handed a link — but a
 * readable key makes the bucket auditable by eye.
 */
function objectKey(kind: DocumentKind, userId: string | null, fileName: string): string {
  const safe = (fileName || 'document.pdf').replace(/[^A-Za-z0-9._-]+/g, '_').slice(-80);
  const stamp = new Date().toISOString().slice(0, 10);
  const nonce = crypto.randomBytes(6).toString('hex');
  return `uploads/${kind}/${userId || 'anonymous'}/${stamp}-${nonce}-${safe}`;
}

/**
 * Keep an uploaded PDF. Returns its id, or null if it could not be kept — the caller
 * carries on either way.
 */
export async function storeUploadedDocument(args: {
  kind: DocumentKind;
  buffer: Buffer;
  fileName: string | null;
  contentType?: string;
  userId?: string | null;
  userEmail?: string | null;
  /** Set when the owning record already exists; otherwise link it later. */
  billId?: string | null;
  contractId?: string | null;
}): Promise<number | null> {
  try {
    const t = await table();
    const fileName = (args.fileName || 'document.pdf').slice(0, 300);
    const sha256 = crypto.createHash('sha256').update(args.buffer).digest('hex');

    // Same file, same owner, still live? Point at the one already held rather than
    // paying for a second copy — re-reading a bill after a failed save is common.
    const existing = await prisma.$queryRawUnsafe<Array<{ id: bigint }>>(
      `SELECT id FROM ${t}
       WHERE "sha256" = $1 AND "kind" = $2 AND "userId" IS NOT DISTINCT FROM $3
         AND "expiresAt" > CURRENT_TIMESTAMP
       ORDER BY "createdAt" DESC LIMIT 1`,
      sha256, args.kind, args.userId ?? null,
    );
    if (existing[0]) return Number(existing[0].id);

    const { uploadFile, DB_STORAGE_MAX_BYTES } = await import('./s3');
    const key = objectKey(args.kind, args.userId ?? null, fileName);
    const returned = await uploadFile(args.buffer, key);

    // uploadFile answers "db://…" when the bucket is unreachable. Small files then go
    // in the row; a large one is recorded WITHOUT its bytes rather than putting tens
    // of megabytes of base64 in a column that every SELECT would have to skip past.
    const inBucket = !returned.startsWith('db://');
    const tooBigForRow = !inBucket && args.buffer.byteLength > DB_STORAGE_MAX_BYTES;
    // Say when the bucket refused it, not only when the file was then too big for the
    // fallback. Storage failing silently is how it went unnoticed for a fortnight: every
    // upload logged a line on the server and nothing anywhere else showed a difference.
    const note = tooBigForRow
      ? `File storage was unavailable and the file is larger than ${Math.round(DB_STORAGE_MAX_BYTES / 1024 / 1024)}MB, so only its details were kept.`
      : !inBucket
        ? 'File storage was unavailable, so this was kept in the database instead.'
        : null;

    const rows = await prisma.$queryRawUnsafe<Array<{ id: bigint }>>(
      `INSERT INTO ${t}
        ("expiresAt", "kind", "billId", "contractId", "userId", "userEmail",
         "fileName", "contentType", "byteSize", "sha256", "storagePath", "pdfBase64", "note")
       VALUES (CURRENT_TIMESTAMP + INTERVAL '${DOCUMENT_RETENTION_DAYS} days', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING id`,
      args.kind,
      args.billId ?? null,
      args.contractId ?? null,
      args.userId ?? null,
      args.userEmail ?? null,
      fileName,
      args.contentType || 'application/pdf',
      args.buffer.byteLength,
      sha256,
      inBucket ? returned : null,
      inBucket || tooBigForRow ? null : args.buffer.toString('base64'),
      note,
    );
    return rows[0] ? Number(rows[0].id) : null;
  } catch (error: any) {
    // Almost always "table not applied yet". Never the user's problem.
    logger.warn('uploaded-documents: could not store the file:', error?.message || error);
    return null;
  }
}

/** Attach a stored document to the bill or contract it turned into. */
export async function linkUploadedDocument(
  id: number | string | null | undefined,
  target: { billId?: string | null; contractId?: string | null; userId?: string | null },
): Promise<boolean> {
  const documentId = Number(id);
  if (!documentId || !Number.isFinite(documentId)) return false;
  try {
    const t = await table();
    // Scoped to the uploader: an id from a request body must not be able to staple
    // somebody else's document onto this bill.
    const affected = await prisma.$executeRawUnsafe(
      `UPDATE ${t} SET "billId" = COALESCE($1, "billId"), "contractId" = COALESCE($2, "contractId")
       WHERE id = $3 AND ($4::text IS NULL OR "userId" = $4)`,
      target.billId ?? null, target.contractId ?? null, documentId, target.userId ?? null,
    );
    return affected > 0;
  } catch (error: any) {
    logger.warn('uploaded-documents: could not link the file:', error?.message || error);
    return false;
  }
}

/** The documents held for a bill or a contract, newest first. Never their bytes. */
export async function listUploadedDocuments(
  target: { billId?: string | null; contractId?: string | null },
): Promise<StoredDocument[]> {
  if (!target.billId && !target.contractId) return [];
  try {
    const t = await table();
    const rows = await prisma.$queryRawUnsafe<Array<Record<string, any>>>(
      `SELECT id, "kind", "billId", "contractId", "userId", "fileName", "contentType",
              "byteSize", "createdAt", "expiresAt", "storagePath", "note"
       FROM ${t}
       WHERE ($1::text IS NOT NULL AND "billId" = $1) OR ($2::text IS NOT NULL AND "contractId" = $2)
       ORDER BY "createdAt" DESC LIMIT 20`,
      target.billId ?? null, target.contractId ?? null,
    );
    return rows.map(r => ({ ...r, id: Number(r.id), byteSize: Number(r.byteSize) })) as StoredDocument[];
  } catch {
    // The table is not applied yet, or has just been swept. Either way: nothing held.
    return [];
  }
}

/** One document with its bytes, for serving. Null when it is gone or never had any. */
export async function readUploadedDocument(id: number): Promise<
  (StoredDocument & { pdfBase64: string | null }) | null
> {
  try {
    const t = await table();
    const rows = await prisma.$queryRawUnsafe<Array<Record<string, any>>>(
      `SELECT id, "kind", "billId", "contractId", "userId", "fileName", "contentType",
              "byteSize", "createdAt", "expiresAt", "storagePath", "note", "pdfBase64"
       FROM ${t} WHERE id = $1`,
      id,
    );
    const row = rows[0];
    if (!row) return null;
    return { ...row, id: Number(row.id), byteSize: Number(row.byteSize) } as StoredDocument & { pdfBase64: string | null };
  } catch {
    return null;
  }
}

/**
 * Remove documents and the files behind them. Used by the nightly sweep and when a
 * bill or contract is deleted, so the file goes when the record does rather than
 * waiting out its ninety days.
 */
export async function purgeUploadedDocuments(
  where: { billId?: string | null; contractId?: string | null; ids?: number[] },
): Promise<number> {
  try {
    const t = await table();
    // Ids are integers this module produced or validated, never raw input, so they go
    // in as literals. An array parameter would have to be cast to bigint[] to compare
    // against a BIGSERIAL column, and getting that wrong fails at runtime rather than
    // at build time.
    const idList = (where.ids || []).map(Number).filter(Number.isFinite);
    const rows = await prisma.$queryRawUnsafe<Array<{ id: bigint; storagePath: string | null }>>(
      `SELECT id, "storagePath" FROM ${t}
       WHERE ($1::text IS NOT NULL AND "billId" = $1)
          OR ($2::text IS NOT NULL AND "contractId" = $2)
          ${idList.length ? `OR id IN (${idList.join(', ')})` : ''}`,
      where.billId ?? null, where.contractId ?? null,
    );
    if (rows.length === 0) return 0;
    await removeObjects(rows.map(r => r.storagePath));
    return await deleteRows(t, rows.map(r => Number(r.id)));
  } catch (error: any) {
    logger.warn('uploaded-documents: purge failed:', error?.message || error);
    return 0;
  }
}

/**
 * The nightly sweep: anything past its ninety days, plus anything that was uploaded
 * and never attached to a bill or contract (an abandoned form, or a record whose bill
 * has since been deleted — the foreign key nulls the link rather than leaving a row
 * pointing at nothing).
 */
export async function sweepUploadedDocuments(dryRun: boolean): Promise<number> {
  const t = await table();
  const predicate =
    `"expiresAt" < CURRENT_TIMESTAMP
     OR ("billId" IS NULL AND "contractId" IS NULL
         AND "createdAt" < CURRENT_TIMESTAMP - INTERVAL '${UNLINKED_GRACE_DAYS} days')`;

  if (dryRun) {
    const rows = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
      `SELECT COUNT(*)::bigint AS count FROM ${t} WHERE ${predicate}`);
    return Number(rows[0]?.count ?? 0);
  }

  // A bounded batch: a sweep that has to delete a hundred thousand objects should take
  // several nights rather than one timed-out function.
  const rows = await prisma.$queryRawUnsafe<Array<{ id: bigint; storagePath: string | null }>>(
    `SELECT id, "storagePath" FROM ${t} WHERE ${predicate} ORDER BY "createdAt" LIMIT 500`);
  if (rows.length === 0) return 0;
  await removeObjects(rows.map(r => r.storagePath));
  return await deleteRows(t, rows.map(r => Number(r.id)));
}

/** Delete by id list. Literals, for the reason given in purgeUploadedDocuments. */
async function deleteRows(t: string, ids: number[]): Promise<number> {
  const clean = ids.map(Number).filter(Number.isFinite);
  if (clean.length === 0) return 0;
  return prisma.$executeRawUnsafe(`DELETE FROM ${t} WHERE id IN (${clean.join(', ')})`);
}

/**
 * Delete the bucket objects for a set of rows. Failures are logged, not thrown: an
 * object that will not delete must not keep its row alive for ever, and the row is
 * the only thing the app can reach it through.
 */
async function removeObjects(paths: Array<string | null>): Promise<void> {
  const keys = paths.filter((p): p is string => !!p);
  if (keys.length === 0) return;
  try {
    const { deleteFile } = await import('./s3');
    for (const key of keys) await deleteFile(key);
  } catch (error: any) {
    logger.warn('uploaded-documents: could not delete stored files:', error?.message || error);
  }
}
