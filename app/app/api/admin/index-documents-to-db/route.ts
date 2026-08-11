/**
 * Move component index documents out of object storage and into the database.
 *
 * These documents are embedded into every statement that cites them, so in object
 * storage each report downloads them again and each download is billed as egress. That
 * is what exhausted this project's quota and had storage cut off entirely — which took
 * uploads down with it, since a restricted project refuses to sign them.
 *
 * Held in the database a document is read over a connection that is already open, at no
 * egress, however many reports embed it. New uploads go there already; this brings the
 * ones uploaded before across.
 *
 * Each document is fetched once — the only egress it will ever cost again — and written
 * back as base64 with a db:// path, which is the form the embedder already prefers and
 * reads without any request at all. The storage object is deliberately NOT deleted:
 * moving a document and destroying its only other copy in one pass is not a trade worth
 * making, and an object nobody downloads costs nothing but storage.
 *
 * Safe to run twice — a document already on db:// is skipped. Safe to interrupt: each
 * one is committed on its own, so a run that dies halfway leaves the rest to a later
 * one rather than losing what it did.
 */
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getFileUrl, DB_STORAGE_MAX_BYTES } from '@/lib/s3';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return { ok: false as const, status: 401, error: 'Unauthorized' };
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { role: true },
  });
  if (user?.role !== 'admin' && user?.role !== 'superadmin') {
    return { ok: false as const, status: 403, error: 'Access denied. Admin only.' };
  }
  return { ok: true as const };
}

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const documents = await prisma.labourIndexDocument.findMany({
    select: { id: true, fileName: true, cloudStoragePath: true, remarks: true },
  });
  const inDatabase = documents.filter(doc => doc.cloudStoragePath.startsWith('db://')).length;
  return NextResponse.json({
    total: documents.length,
    inDatabase,
    inObjectStorage: documents.length - inDatabase,
    message: documents.length - inDatabase === 0
      ? 'Every index document is already in the database — no report downloads them.'
      : `${documents.length - inDatabase} document(s) are still in object storage, and every report that embeds one downloads it again. Send a POST to move them.`,
  });
}

export async function POST() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const documents = await prisma.labourIndexDocument.findMany({
    select: { id: true, fileName: true, cloudStoragePath: true },
  });
  const pending = documents.filter(doc => !doc.cloudStoragePath.startsWith('db://'));

  const moved: string[] = [];
  const failed: Array<{ fileName: string; reason: string }> = [];
  let bytesMoved = 0;

  for (const doc of pending) {
    try {
      const url = await getFileUrl(doc.cloudStoragePath);
      const response = await fetch(url);
      if (!response.ok) throw new Error(`download returned HTTP ${response.status}`);
      const bytes = Buffer.from(await response.arrayBuffer());

      if (bytes.byteLength > DB_STORAGE_MAX_BYTES) {
        failed.push({
          fileName: doc.fileName,
          reason: `${(bytes.byteLength / 1024 / 1024).toFixed(1)} MB is past the ${(DB_STORAGE_MAX_BYTES / 1024 / 1024)} MB the database holds; left in storage.`,
        });
        continue;
      }

      // The path keeps its name so the document is still identifiable, and the bytes go
      // into remarks in the form the embedder already reads without a request.
      await prisma.labourIndexDocument.update({
        where: { id: doc.id },
        data: {
          cloudStoragePath: `db://${doc.cloudStoragePath}`,
          remarks: `base64:${bytes.toString('base64')}`,
        },
      });
      moved.push(doc.fileName);
      bytesMoved += bytes.byteLength;
    } catch (error: any) {
      // A restricted project refuses downloads too, so this is the expected failure
      // while the quota is still exceeded. Named plainly rather than counted.
      failed.push({ fileName: doc.fileName, reason: String(error?.message || error).slice(0, 200) });
    }
  }

  return NextResponse.json({
    moved: moved.length,
    failed,
    megabytesMoved: Math.round((bytesMoved / 1024 / 1024) * 100) / 100,
    message: moved.length > 0
      ? `Moved ${moved.length} document(s) into the database. Reports no longer download them, so they cost no egress from here on.`
      : pending.length === 0
        ? 'Nothing to move — every index document is already in the database.'
        : 'Nothing could be moved. If storage is still restricted, clear that first: a restricted project refuses downloads as well as uploads.',
  });
}
