/**
 * One-time, admin-only helper to apply pending additive columns.
 *
 * Why this exists: these columns ship as Prisma migrations, but running
 * `prisma migrate deploy` needs the production DATABASE_URL, which Vercel stores as
 * a sensitive value and will not reveal. The deployed app already holds that
 * connection, so it can apply these columns itself.
 *
 * Scope is deliberately narrow and additive: columns are added IF NOT EXISTS, and the
 * tables and indexes below are created the same way. Nothing is dropped, no existing
 * data is touched, and it is safe to run twice. GET reports what is present; POST
 * applies what is missing.
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
type ExtraCheck = { kind: 'table' | 'index' | 'constraint'; name: string };

const PENDING_EXTRAS: Array<{ label: string; sql: string; why: string; check: ExtraCheck }> = [
  {
    label: 'dsr_items',
    sql: `CREATE TABLE IF NOT EXISTS "dsr_items" (
        "edition" TEXT NOT NULL,
        "code" TEXT NOT NULL,
        "subHead" TEXT NOT NULL,
        "subHeadName" TEXT NOT NULL,
        "description" TEXT NOT NULL,
        "unit" TEXT NOT NULL DEFAULT '',
        "rate" DOUBLE PRECISION,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "dsr_items_pkey" PRIMARY KEY ("edition", "code")
      )`,
    why: 'The published schedules of rates, so an item can be looked up by its code.',
    check: { kind: 'table', name: 'dsr_items' },
  },
  {
    label: 'dsr_items_code_idx',
    sql: 'CREATE INDEX IF NOT EXISTS "dsr_items_code_idx" ON "dsr_items" ("code")',
    why: 'Bills cite a code without saying which edition it came from.',
    check: { kind: 'index', name: 'dsr_items_code_idx' },
  },
  {
    label: 'bills_status_approvedAt_idx',
    sql: 'CREATE INDEX IF NOT EXISTS "bills_status_approvedAt_idx" ON "bills" ("status", "approvedAt")',
    why: 'The accounts inbox lists proposals awaiting vetting, oldest first.',
    check: { kind: 'index', name: 'bills_status_approvedAt_idx' },
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
    check: { kind: 'constraint', name: 'bills_passedBy_fkey' },
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

async function extraExists(check: ExtraCheck): Promise<boolean> {
  const sql = check.kind === 'table'
    ? `SELECT 1 FROM information_schema.tables WHERE table_name = '${check.name}'`
    : check.kind === 'index'
      ? `SELECT 1 FROM pg_indexes WHERE indexname = '${check.name}'`
      : `SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = '${check.name}'`;
  const rows = await prisma.$queryRawUnsafe<Array<unknown>>(sql);
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

/**
 * The tables and indexes, reported the same way the columns are.
 *
 * They were applied on POST but never reported, so once every column existed the page
 * said "nothing to do" and disabled its own button — and the table added here could
 * never be created through it.
 */
async function extraStatuses() {
  return Promise.all(
    PENDING_EXTRAS.map(async (extra) => ({
      table: extra.check.name,
      column: extra.check.kind,
      why: extra.why,
      exists: await extraExists(extra.check),
    })),
  );
}

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  try {
    const columns = [...await statuses(), ...await extraStatuses()];
    const missing = columns.filter((c) => !c.exists);
    return NextResponse.json({
      columns,
      // Kept for the existing page, which reads a single boolean.
      exists: missing.length === 0,
      allApplied: missing.length === 0,
      message: missing.length === 0
        ? 'All applied — nothing to do.'
        : `${missing.length} change(s) missing. Send a POST to this URL to apply them.`,
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

    const columns = [...await statuses(), ...await extraStatuses()];
    const stillMissing = columns.filter((c) => !c.exists);
    return NextResponse.json({
      columns,
      added: applied.length > 0,
      applied,
      exists: stillMissing.length === 0,
      extrasFailed,
      message: [
        applied.length ? `Added: ${applied.join(', ')}.` : 'All columns were already present.',
        stillMissing.length === 0 ? 'Every table and index is in place too.' : '',
        extrasFailed.length ? `The table/index step could not finish (${extrasFailed.join(', ')}); the columns are in place and the app will work.` : '',
      ].filter(Boolean).join(' '),
    });
  } catch (error: any) {
    console.error('apply pending columns failed:', error);
    return NextResponse.json({ error: error?.message || 'Failed to add column' }, { status: 500 });
  }
}
