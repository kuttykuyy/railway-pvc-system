/**
 * One-time, admin-only helper to apply pending additive columns.
 *
 * Why this exists: these columns ship as Prisma migrations, but running
 * `prisma migrate deploy` needs the production DATABASE_URL, which Vercel stores as
 * a sensitive value and will not reveal. The deployed app already holds that
 * connection, so it can apply these columns itself.
 *
 * Scope is deliberately narrow: columns are added IF NOT EXISTS, and the tables and
 * indexes below are created the same way. No existing data is ever touched, and it is
 * safe to run twice. GET reports what is present; POST applies what is missing.
 *
 * One entry drops indexes rather than creating them — the redundant ones found by the
 * database audit. That is still safe by the same standard: an index holds no data, it
 * is named explicitly, dropping it is instantly reversible by recreating it, and a
 * `DROP INDEX` can never remove the index behind a unique constraint (those are named
 * `_key`, the redundant copies `_idx`). Nothing else in this file drops anything.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { tableSchema } from '@/lib/db-schema';

export const dynamic = 'force-dynamic';

/**
 * The schema the app's tables live in, asked of the database (not assumed). Every
 * check and every DDL statement below must name it: the pooled connection's search
 * path is roulette (unqualified DDL failed 42P01 in production on 14 Aug 2026), and a
 * stale "public"."User" leftover means an unqualified existence check can find a
 * column in the WRONG schema and skip an ALTER the app actually needs.
 */
async function appSchema(): Promise<string> {
  return tableSchema('contracts');
}

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
  {
    table: 'bills',
    column: 'extraItemsOutsidePvc',
    ddlType: 'DOUBLE PRECISION DEFAULT 0',
    why: "GCC-2022 Cl.46A.1(b) puts extra items added under Cl.39(1)(b) outside price variation, unless PVC and a base month were specially agreed when their rates were fixed.",
  },
  {
    table: 'contracts',
    column: 'pvcClauseVersion',
    ddlType: 'TEXT',
    why: 'Which GCC prices the contract. A tender closing before April 2022 carries a different price variation clause, and around the changeover only a human reading the agreement can tell. (Not "gccVersion" — the database already has a column of that name holding an enum this app does not own.)',
  },
  {
    table: 'contracts',
    column: 'pre2022WorkType',
    ddlType: 'TEXT',
    why: "For pre-2022 contracts: which of Clause 46A.6's six work types applies. The tender fixes one for the whole work, and the percentages differ a great deal between them.",
  },
  {
    table: 'bills',
    column: 'jpcDocsPurchasedAt',
    ddlType: 'TIMESTAMP(3)',
    why: 'When the charge for attaching the JPC steel sheets to this bill\'s report was paid. The sheets come from a paid subscription; the charge is once per bill.',
  },
  {
    table: 'User',
    column: 'jpcViewUntil',
    ddlType: 'TIMESTAMP(3)',
    why: 'JPC sheet viewing paid until this moment - Rs 249 from credits buys 30 days of reading the official sheets on screen.',
  },
  {
    table: 'bill_classification_entries',
    column: 'billPageNumber',
    ddlType: 'INTEGER',
    why: 'Which page of the bill PDF the item was read from, so a classification can be checked against the printed row without hunting through 27 pages.',
  },
];

/**
 * Applied after the columns. Each must be safe to run twice and must not touch data.
 * Neither is needed for the feature to work — Prisma joins on the column with or
 * without a database-level foreign key — but without them the live schema drifts from
 * schema.prisma, and the next person to read one would not match the other.
 */
/**
 * `indexes-absent` is the mirror of `index`: its `name` is a comma-separated list, and
 * it counts as applied when NONE of them exist any more — so a drop reports itself the
 * same way a create does, and the page can say whether it still has work to do.
 */
type ExtraCheck = { kind: 'table' | 'index' | 'constraint' | 'indexes-absent'; name: string };

// sql takes the resolved schema so every statement names where it acts — an
// unqualified CREATE lands wherever the pooled search path points that instant.
const PENDING_EXTRAS: Array<{ label: string; sql: (s: string) => string; why: string; check: ExtraCheck }> = [
  {
    label: 'parse_failures',
    sql: (s) => `CREATE TABLE IF NOT EXISTS "${s}"."parse_failures" (
        "id" BIGSERIAL PRIMARY KEY,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "userEmail" TEXT,
        "fileName" TEXT,
        "error" TEXT NOT NULL,
        "pdfBase64" TEXT
      )`,
    why: 'Every PDF the reader could not read, kept with its exact error — the support queue and the regression corpus in one table.',
    check: { kind: 'table', name: 'parse_failures' },
  },
  {
    label: 'dsr_items',
    sql: (s) => `CREATE TABLE IF NOT EXISTS "${s}"."dsr_items" (
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
    sql: (s) => `CREATE INDEX IF NOT EXISTS "dsr_items_code_idx" ON "${s}"."dsr_items" ("code")`,
    why: 'Bills cite a code without saying which edition it came from.',
    check: { kind: 'index', name: 'dsr_items_code_idx' },
  },
  {
    label: 'bills_status_approvedAt_idx',
    sql: (s) => `CREATE INDEX IF NOT EXISTS "bills_status_approvedAt_idx" ON "${s}"."bills" ("status", "approvedAt")`,
    why: 'The accounts inbox lists proposals awaiting vetting, oldest first.',
    check: { kind: 'index', name: 'bills_status_approvedAt_idx' },
  },
  {
    label: 'bills_contract_billno_unique',
    sql: (s) => `CREATE UNIQUE INDEX IF NOT EXISTS "bills_contractId_billNo_key"
      ON "${s}"."bills" ("contractId", LOWER("billNo"))`,
    why: 'One bill number per contract, enforced by the database. The route checks for a '
      + 'duplicate and then creates the bill a few hundred lines later, with several '
      + 'queries in between — two requests can both pass that check. On LOWER(billNo) '
      + 'because the check itself is case-insensitive.',
    check: { kind: 'index', name: 'bills_contractId_billNo_key' },
  },
  {
    label: 'bills_passedBy_fkey',
    sql: (s) => `DO $$
      BEGIN
        ALTER TABLE "${s}"."bills"
          ADD CONSTRAINT "bills_passedBy_fkey"
          FOREIGN KEY ("passedBy") REFERENCES "${s}"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
      EXCEPTION
        WHEN duplicate_object THEN NULL;
        WHEN undefined_column THEN NULL;
      END $$`,
    why: 'Ties the accounts signature to a real user, and clears it if that user is deleted.',
    check: { kind: 'constraint', name: 'bills_passedBy_fkey' },
  },
  {
    label: 'credit_transactions_userId_idx',
    sql: (s) => `CREATE INDEX IF NOT EXISTS "credit_transactions_userId_idx"
      ON "${s}"."credit_transactions" ("userId", "type")`,
    why: 'credit_transactions carried no index at all, and /api/credits/balance counts '
      + 'this user\'s top-ups on every call — the second-busiest route in the app, 199 '
      + 'requests in a day. Every one scanned the whole ledger, which only ever grows. '
      + 'Eleven other places read it by userId too, including every PDF and Excel report.',
    check: { kind: 'index', name: 'credit_transactions_userId_idx' },
  },
  {
    label: 'contract_extensions_contractId_idx',
    sql: (s) => `CREATE INDEX IF NOT EXISTS "contract_extensions_contractId_idx"
      ON "${s}"."contract_extensions" ("contractId")`,
    why: 'Extensions are always read for one contract, and the table had no index.',
    check: { kind: 'index', name: 'contract_extensions_contractId_idx' },
  },
  {
    label: 'report_templates_userId_idx',
    sql: (s) => `CREATE INDEX IF NOT EXISTS "report_templates_userId_idx"
      ON "${s}"."report_templates" ("userId")`,
    why: 'Templates are listed per user, and the table had no index.',
    check: { kind: 'index', name: 'report_templates_userId_idx' },
  },

  // ── From the database audit of 23 Aug 2026 ──────────────────────────────────────
  {
    label: 'pvc_calculations_contractId_createdAt_idx',
    sql: (s) => `CREATE INDEX IF NOT EXISTS "pvc_calculations_contractId_createdAt_idx"
      ON "${s}"."pvc_calculations" ("contractId", "createdAt")`,
    why: 'pvc_calculations held one row per bill and had no index at all beyond its two '
      + 'keys, though it is read BY CONTRACT everywhere — the contract\'s PVC history, the '
      + 'external API, and the cascade when a contract is deleted. Every one of those read '
      + 'the whole table and then sorted it.',
    check: { kind: 'index', name: 'pvc_calculations_contractId_createdAt_idx' },
  },
  {
    label: 'bills_zone_status_passedAt_idx',
    sql: (s) => `CREATE INDEX IF NOT EXISTS "bills_zone_status_passedAt_idx"
      ON "${s}"."bills" ("zone", "status", "passedAt")`,
    why: 'The zone permission filter (zone + status) runs on EVERY request a railway '
      + 'official makes, and the accounts inbox then pages the same rows by passedAt — '
      + 'which was indexed nowhere. One index serves both, because zone and status are '
      + 'equality tests in each and only the sort column differs.',
    check: { kind: 'index', name: 'bills_zone_status_passedAt_idx' },
  },
  {
    label: 'contracts_userId_createdAt_idx',
    sql: (s) => `CREATE INDEX IF NOT EXISTS "contracts_userId_createdAt_idx"
      ON "${s}"."contracts" ("userId", "createdAt")`,
    why: '"My contracts, newest first" — the dashboard and both chat handlers. userId and '
      + 'createdAt were indexed separately, which cannot serve a filter and a sort together, '
      + 'so every one of a user\'s contracts was sorted to return five.',
    check: { kind: 'index', name: 'contracts_userId_createdAt_idx' },
  },
  {
    label: 'parse_failures_createdAt_idx',
    sql: (s) => `CREATE INDEX IF NOT EXISTS "parse_failures_createdAt_idx"
      ON "${s}"."parse_failures" ("createdAt" DESC)`,
    why: 'parse_failures was created by this same route and given nothing but its primary '
      + 'key, though the admin list sorts by createdAt and the table only grows — and each '
      + 'row carries a whole PDF, so a scan is expensive.',
    check: { kind: 'index', name: 'parse_failures_createdAt_idx' },
  },
  {
    label: 'parse_failures_userEmail_createdAt_idx',
    sql: (s) => `CREATE INDEX IF NOT EXISTS "parse_failures_userEmail_createdAt_idx"
      ON "${s}"."parse_failures" ("userEmail", "createdAt" DESC)`,
    why: '"Ask IR-PVC to check this bill" finds the latest failure for one user and file.',
    check: { kind: 'index', name: 'parse_failures_userEmail_createdAt_idx' },
  },
  {
    label: 'drop_redundant_indexes',
    sql: (s) => `DO $$
      DECLARE
        dead text[] := ARRAY[
          'User_email_idx', 'User_referralCode_idx',
          'contracts_agreementNo_idx', 'contracts_dateOfOpening_idx',
          'bills_batchId_idx', 'bills_isChargeable_idx', 'bills_quarter_idx',
          'bills_quarter_status_idx',
          'api_keys_key_idx', 'gst_invoices_invoiceNumber_idx',
          'trial_claimed_agreements_normalizedAgreementNo_idx',
          'pvc_comparison_sessions_sessionToken_idx',
          'monthly_index_values_priceIndexId_month_idx',
          'labour_index_documents_isProvisional_idx'
        ];
        n text;
      BEGIN
        FOREACH n IN ARRAY dead LOOP
          EXECUTE format('DROP INDEX IF EXISTS %I.%I', '${s}', n);
        END LOOP;
      END $$`,
    why: 'Fourteen indexes that cost a write on every insert and update and serve no read. '
      + 'Eight are exact duplicates of a unique constraint — Postgres already built that '
      + 'index, so there were two of each (email, referralCode, agreementNo, api key, '
      + 'invoice number, claimed agreement, comparison token, and the priceIndexId+month '
      + 'pair). The other six are on columns nothing ever filters by: a bill\'s batchId, '
      + 'isChargeable and quarter, a contract\'s dateOfOpening, and a document\'s '
      + 'isProvisional. Only the redundant "_idx" copies are named; the "_key" index behind '
      + 'each unique constraint is untouched, and a DROP INDEX cannot remove one anyway.',
    check: {
      kind: 'indexes-absent',
      name: 'User_email_idx, User_referralCode_idx, contracts_agreementNo_idx, '
        + 'contracts_dateOfOpening_idx, bills_batchId_idx, bills_isChargeable_idx, '
        + 'bills_quarter_idx, bills_quarter_status_idx, api_keys_key_idx, '
        + 'gst_invoices_invoiceNumber_idx, trial_claimed_agreements_normalizedAgreementNo_idx, '
        + 'pvc_comparison_sessions_sessionToken_idx, monthly_index_values_priceIndexId_month_idx, '
        + 'labour_index_documents_isProvisional_idx',
    },
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
  // Scoped to the app's schema: a stale "public"."User" also answers to the bare
  // table name, and a column found THERE must not mark this one as applied.
  const s = await appSchema();
  const rows = await prisma.$queryRawUnsafe<Array<{ column_name: string }>>(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = '${s}' AND table_name = '${table}' AND column_name = '${column}'`,
  );
  return rows.length > 0;
}

async function extraExists(check: ExtraCheck): Promise<boolean> {
  const s = await appSchema();
  const sql = check.kind === 'table'
    ? `SELECT 1 FROM information_schema.tables WHERE table_schema = '${s}' AND table_name = '${check.name}'`
    : check.kind === 'index'
      ? `SELECT 1 FROM pg_indexes WHERE schemaname = '${s}' AND indexname = '${check.name}'`
      : check.kind === 'indexes-absent'
        ? `SELECT 1 WHERE NOT EXISTS (
             SELECT 1 FROM pg_indexes WHERE schemaname = '${s}' AND indexname IN (
               ${check.name.split(',').map(n => `'${n.trim()}'`).join(', ')}
             ))`
        : `SELECT 1 FROM information_schema.table_constraints WHERE table_schema = '${s}' AND constraint_name = '${check.name}'`;
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
      // The label, not check.name: one entry's check names fourteen indexes at once, and
      // the page would have rendered the whole list as if it were a table name.
      table: extra.label,
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
    const s = await appSchema();
    for (const c of PENDING) {
      if (await columnExists(c.table, c.column)) continue;
      await prisma.$executeRawUnsafe(
        `ALTER TABLE "${s}"."${c.table}" ADD COLUMN IF NOT EXISTS "${c.column}" ${c.ddlType}`,
      );
      applied.push(`${c.table}.${c.column}`);
    }

    // Indexes and constraints, after the columns they depend on. A failure here is
    // reported but never loses the columns already added — they are what the app needs.
    const extrasFailed: string[] = [];
    for (const extra of PENDING_EXTRAS) {
      try {
        await prisma.$executeRawUnsafe(extra.sql(s));
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
