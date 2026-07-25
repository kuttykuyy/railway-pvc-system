/**
 * One-time, admin-only helper to add the Bill.railwaySuppliedMaterialValue column.
 *
 * Why this exists: the column ships as a Prisma migration, but running
 * `prisma migrate deploy` needs the production DATABASE_URL, which Vercel stores as
 * a sensitive value and will not reveal. The deployed app already holds that
 * connection, so it can apply this one additive column itself.
 *
 * Scope is deliberately narrow: a single ADD COLUMN IF NOT EXISTS. It creates no
 * tables, drops nothing, and touches no existing data, so running it twice is
 * harmless. GET reports whether the column is present; POST adds it.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

const COLUMN = 'railwaySuppliedMaterialValue';

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

async function columnExists(): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ column_name: string }>>(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = 'bills' AND column_name = '${COLUMN}'`,
  );
  return rows.length > 0;
}

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  try {
    const exists = await columnExists();
    return NextResponse.json({
      column: COLUMN,
      exists,
      message: exists
        ? 'Column already present — nothing to do.'
        : 'Column missing. Send a POST to this URL to add it.',
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Check failed' }, { status: 500 });
  }
}

export async function POST() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  try {
    if (await columnExists()) {
      return NextResponse.json({ column: COLUMN, added: false, message: 'Column already present — nothing to do.' });
    }
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "${COLUMN}" DOUBLE PRECISION DEFAULT 0`,
    );
    const added = await columnExists();
    return NextResponse.json({
      column: COLUMN,
      added,
      message: added ? 'Column added successfully.' : 'Statement ran but the column is still missing — check the logs.',
    });
  } catch (error: any) {
    console.error('apply-railway-material-column failed:', error);
    return NextResponse.json({ error: error?.message || 'Failed to add column' }, { status: 500 });
  }
}
