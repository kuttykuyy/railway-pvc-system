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
    column: 'createdVia',
    ddlType: 'TEXT',
    why: 'Whether the bill was typed in, read from a PDF, or sent through Telegram — the app priced on this fact and then forgot it.',
  },
  {
    table: 'contracts',
    column: 'createdVia',
    ddlType: 'TEXT',
    why: 'Whether the agreement was typed in or filled by reading the agreement PDF.',
  },
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
  // The accounts/audit stage, which follows the executive approval.
  {
    table: 'bills',
    column: 'passedAt',
    ddlType: 'TIMESTAMP(3)',
    why: 'When accounts passed the proposal for payment.',
  },
  {
    table: 'bills',
    column: 'passedBy',
    ddlType: 'TEXT',
    why: 'Which accounts user passed it — the second signature on a PVC proposal.',
  },
  {
    table: 'bills',
    column: 'passedComments',
    ddlType: 'TEXT',
    why: "Accounts' remarks when passing the proposal.",
  },
  {
    table: 'bills',
    column: 'accountsReturnReason',
    ddlType: 'TEXT',
    why: 'Why accounts sent the proposal back, so the executive side knows what to answer.',
  },
  {
    table: 'bills',
    column: 'accountsVerification',
    ddlType: 'JSONB',
    why: 'Which checks the accounts office ticked when passing — what answers an audit query later.',
  },
];

/**
 * Applied after the columns. Each must be safe to run twice and must not touch data.
 * Neither is needed for the feature to work — Prisma joins on the column with or
 * without a database-level foreign key — but without them the live schema drifts from
 * schema.prisma, and the next person to read one would not match the other.
 */
const PENDING_EXTRAS: Array<{ label: string; sql: string; why: string }> = [
  {
    label: 'bills_status_approvedAt_idx',
    sql: 'CREATE INDEX IF NOT EXISTS "bills_status_approvedAt_idx" ON "bills" ("status", "approvedAt")',
    why: 'The accounts inbox lists proposals awaiting vetting, oldest first.',
  },
  {
    label: 'bills_passedBy_fkey',
    sql: `DO $$
      BEGIN
        ALTER TABLE "bills"
          ADD CONSTRAINT "bills_passedBy_fkey"
          FOREIGN KEY ("passedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
      EXCEPTION
        WHEN duplicate_object THEN NULL;
        WHEN undefined_column THEN NULL;
      END $$`,
    why: 'Ties the accounts signature to a real user, and clears it if that user is deleted.',
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

    // Indexes and constraints, after the columns they depend on. A failure here is
    // reported but never loses the columns already added — they are what the app needs.
    const extrasFailed: string[] = [];
    for (const extra of PENDING_EXTRAS) {
      try {
        await prisma.$executeRawUnsafe(extra.sql);
      } catch (err: any) {
        console.error(`pending schema extra "${extra.label}" failed:`, err?.message || err);
        extrasFailed.push(extra.label);
      }
    }

    const columns = await statuses();
    const stillMissing = columns.filter((c) => !c.exists);
    return NextResponse.json({
      columns,
      added: applied.length > 0,
      applied,
      exists: stillMissing.length === 0,
      extrasFailed,
      message: [
        applied.length ? `Added: ${applied.join(', ')}.` : 'All columns were already present — nothing to do.',
        extrasFailed.length ? `The index/constraint step could not finish (${extrasFailed.join(', ')}); the columns are in place and the app will work.` : '',
      ].filter(Boolean).join(' '),
    });
  } catch (error: any) {
    console.error('apply pending columns failed:', error);
    return NextResponse.json({ error: error?.message || 'Failed to add column' }, { status: 500 });
  }
}
