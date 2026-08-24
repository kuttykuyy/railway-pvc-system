import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { schemaQualified } from '@/lib/db-schema';
import { objectExists } from '@/lib/s3';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * Which stored files are actually still there.
 *
 * The Supabase project the bucket lived in was deleted, and storage now points at a new
 * one. Every row that names a file still names it — nothing in the database changed —
 * so the only way to know what survived is to ask the bucket about each key. Otherwise
 * it is found out one broken link at a time, by whoever needed the file.
 *
 * Read-only, and it changes nothing: it says what to re-upload, it does not tidy the
 * rows away. A row whose file is gone still records that the document existed, who
 * uploaded it and when, and that is worth more than a clean table.
 *
 * Three verdicts, not two. "Could not tell" is kept separate from "missing", because a
 * refused credential or a network blip is not evidence a file is gone, and treating it
 * as gone would send somebody re-uploading files that are sitting right there.
 */

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return { ok: false as const, status: 401, error: 'Unauthorized' };
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { role: true },
  });
  if (user?.role !== 'admin' && user?.role !== 'superadmin') {
    return { ok: false as const, status: 403, error: 'Admin access required' };
  }
  return { ok: true as const };
}

interface Checked {
  what: string;
  label: string;
  key: string;
  createdAt?: Date | null;
  verdict: 'present' | 'missing' | 'unknown' | 'in-database';
}

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const rows: Array<Omit<Checked, 'verdict'>> = [];

  // ── Component index documents and JPC sheets ────────────────────────────────
  const documents = await prisma.labourIndexDocument.findMany({
    select: {
      id: true, fileName: true, cloudStoragePath: true, createdAt: true,
      componentType: true, year: true, months: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 500,
  });
  for (const doc of documents) {
    rows.push({
      what: 'Index document',
      label: `${doc.componentType} ${doc.year} ${(doc.months || []).join(',')} — ${doc.fileName}`,
      key: doc.cloudStoragePath,
      createdAt: doc.createdAt,
    });
  }

  // ── Report logos ────────────────────────────────────────────────────────────
  const logos = await prisma.user.findMany({
    where: { logoPath: { not: null } },
    select: { email: true, logoPath: true },
    take: 500,
  });
  for (const user of logos) {
    rows.push({ what: 'Report logo', label: user.email, key: user.logoPath as string });
  }

  // ── Kept bill and LOA PDFs ──────────────────────────────────────────────────
  try {
    const table = await schemaQualified('uploaded_documents');
    const kept = await prisma.$queryRawUnsafe<Array<Record<string, any>>>(
      `SELECT "fileName", "storagePath", "createdAt", "userEmail"
       FROM ${table} WHERE "storagePath" IS NOT NULL ORDER BY "createdAt" DESC LIMIT 500`);
    for (const row of kept) {
      rows.push({
        what: 'Uploaded bill/LOA',
        label: `${row.fileName} — ${row.userEmail || 'unknown'}`,
        key: row.storagePath,
        createdAt: row.createdAt,
      });
    }
  } catch {
    // The table ships through Pending DB Changes; absent is not an error here.
  }

  // Ask storage about each one. Sequential on purpose: a few hundred HEADs against one
  // bucket on a single serverless instance is not something to fire off all at once.
  const checked: Checked[] = [];
  for (const row of rows) {
    if (!row.key) continue;
    if (row.key.startsWith('db://')) {
      // These never went to the bucket — the bytes are in the database row and survived
      // the project being deleted untouched.
      checked.push({ ...row, verdict: 'in-database' });
      continue;
    }
    checked.push({ ...row, verdict: await objectExists(row.key) });
  }

  const by = (verdict: Checked['verdict']) => checked.filter(c => c.verdict === verdict);
  const missing = by('missing');
  const unknown = by('unknown');

  const groupCount = (list: Checked[]) => list.reduce((acc: Record<string, number>, item) => {
    acc[item.what] = (acc[item.what] || 0) + 1;
    return acc;
  }, {});

  return NextResponse.json({
    checked: checked.length,
    present: by('present').length,
    inDatabase: by('in-database').length,
    missing: missing.length,
    couldNotTell: unknown.length,
    missingByKind: groupCount(missing),
    // The list to act on. Everything here needs uploading again — the file it names went
    // with the deleted project.
    missingFiles: missing.slice(0, 200).map(m => ({
      what: m.what, label: m.label, key: m.key, uploadedAt: m.createdAt ?? null,
    })),
    couldNotTellFiles: unknown.slice(0, 50).map(m => ({ what: m.what, label: m.label, key: m.key })),
    note: missing.length === 0 && unknown.length === 0
      ? 'Every stored file is where its record says it is.'
      : `${missing.length} file(s) are gone and need uploading again. `
        + `${by('in-database').length} were kept in the database and are unaffected.`
        + (unknown.length ? ` ${unknown.length} could not be checked — try again before acting on those.` : ''),
  });
}
