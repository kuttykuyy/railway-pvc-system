/**
 * One-time, admin-only helper to apply pending additive columns.
 *
 * Why this exists: these columns ship as Prisma migrations, but running
 * `prisma migrate deploy` needs the production DATABASE_URL, which Vercel stores as
 * a sensitive value and will not reveal. The deployed app already holds that
 * connection, so it can apply these columns itself.
 *
 * Scope is deliberately narrow: ADD COLUMN IF NOT EXISTS only. No tables created,
 * nothing dropped, no existing data touched, and safe to run twice. GET reports
 * which columns are present; POST adds the missing ones.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface PendingColumn {
  table: string;
  column: string;
  ddlType: string;
  why: string;
}

const PENDING: PendingColumn[] = [
  {
    table: 'bills',
    column: 'railwaySuppliedMaterialValue',
    ddlType: 'DOUBLE PRECISION DEFAULT 0',
    why: 'GCC-2022 Cl.46A excludes railway-supplied material from the PVC base (W).',
  },
  {
    table: 'contracts',
    column: 'fuelPriceType',
    ddlType: "TEXT DEFAULT 'four_city_avg'",
    why: 'Fuel basis is per agreement — SWR directs the PPAC 4-city average, Sr.DFM/MDU demands the zone city rate.',
  },
];

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

async function columnExists(table: string, column: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ column_name: string }>>(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = '${table}' AND column_name = '${column}'`,
  );
  return rows.length > 0;
}

async function statuses() {
  return Promise.all(
    PENDING.map(async (c) => ({
      table: c.table,
      column: c.column,
      why: c.why,
      exists: await columnExists(c.table, c.column),
    })),
  );
}

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  try {
    const columns = await statuses();
    const missing = columns.filter((c) => !c.exists);
    return NextResponse.json({
      columns,
      // Kept for the existing page, which reads a single boolean.
      exists: missing.length === 0,
      allApplied: missing.length === 0,
      message: missing.length === 0
        ? 'All columns already present — nothing to do.'
        : `${missing.length} column(s) missing. Send a POST to this URL to add them.`,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Check failed' }, { status: 500 });
  }
}

export async function POST() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  try {
    const applied: string[] = [];
    for (const c of PENDING) {
      if (await columnExists(c.table, c.column)) continue;
      await prisma.$executeRawUnsafe(
        `ALTER TABLE "${c.table}" ADD COLUMN IF NOT EXISTS "${c.column}" ${c.ddlType}`,
      );
      applied.push(`${c.table}.${c.column}`);
    }
    const columns = await statuses();
    const stillMissing = columns.filter((c) => !c.exists);
    return NextResponse.json({
      columns,
      added: applied.length > 0,
      applied,
      exists: stillMissing.length === 0,
      message: applied.length
        ? `Added: ${applied.join(', ')}.`
        : 'All columns were already present — nothing to do.',
    });
  } catch (error: any) {
    console.error('apply pending columns failed:', error);
    return NextResponse.json({ error: error?.message || 'Failed to add column' }, { status: 500 });
  }
}
