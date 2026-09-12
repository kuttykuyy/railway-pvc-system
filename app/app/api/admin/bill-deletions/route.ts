import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { schemaQualified } from '@/lib/db-schema';
import { validateAdminAccess } from '@/lib/role-auth';

export const dynamic = 'force-dynamic';

/** The deletion log, newest first — the only record of a bill once it is gone. */
export async function GET(request: NextRequest) {
  const { authorized, message } = await validateAdminAccess(request);
  if (!authorized) return NextResponse.json({ error: message || 'Admin access required' }, { status: 403 });

  const table = await schemaQualified('bill_deletions').catch(() => null);
  if (!table) return NextResponse.json({ deletions: [], note: 'Apply Pending DB Changes to create the table.' });

  const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `SELECT id, "deletedAt", "billNo", "agreementNo", "ownerEmail", "deletedByEmail", "deletedByRole",
            "wasFree", "freeReason", "chargedAmount", "billAmount", "totalPvc", "dateOfMeasurement",
            "billCreatedAt", "ageMinutes", "ownerUserId", "deletedByUserId"
       FROM ${table} ORDER BY "deletedAt" DESC LIMIT 200`,
  );
  // How many bills each owner has deleted in the window shown, so a repeat pattern
  // stands out without counting rows by eye.
  const perOwner = new Map<string, number>();
  for (const r of rows) {
    const k = String(r.ownerUserId || r.ownerEmail || '');
    if (k) perOwner.set(k, (perOwner.get(k) || 0) + 1);
  }
  return NextResponse.json({
    deletions: rows.map(r => ({
      ...r,
      id: Number(r.id),
      ownerDeletions: perOwner.get(String(r.ownerUserId || r.ownerEmail || '')) || 1,
    })),
  });
}
