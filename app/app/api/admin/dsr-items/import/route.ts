/**
 * Load the published schedules of rates into the database.
 *
 * Three books: CPWD DSR 2021 and 2023, and the Indian Railways USSOR 2021. Each ships
 * with the app under data/ — extracted from the official PDFs by
 * scripts/extract-rate-book.ts — rather than being uploaded, because a whole schedule
 * is well past the request size a deployment accepts, and because a rate book that
 * decides money should be the same for everyone rather than whatever file happened to
 * be uploaded last.
 *
 * Everything here is raw SQL. The table is created by the pending-schema endpoint and
 * a Prisma model for it is deliberately absent until it exists everywhere: Prisma
 * selects every scalar a model declares, so a model naming a table the database has
 * not got breaks every query that touches it.
 */
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import dsr2021 from '@/data/dsr-2021.json';
import dsr2023 from '@/data/dsr-2023.json';
import ussor2021 from '@/data/ussor-2021.json';

export const dynamic = 'force-dynamic';

interface PackedItem { c: string; s: string; n: string; d: string; u: string; r: number | null }
interface Book { edition: string; source: string; items: PackedItem[] }

// Editions are kept apart because a code means different things in each: DSR 2023
// reuses 2021's numbering at different rates, and USSOR numbers by chapter entirely.
// A bill has to say which book it is quoting before a lookup can mean anything.
const BOOKS: Book[] = [dsr2021 as Book, dsr2023 as Book, ussor2021 as Book];

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

// The schema the app's tables live in — dsr_items must be created and written THERE,
// where the Prisma model reads it. Unqualified, the existence check matched a stale
// copy in any schema and the writes went wherever the pooled search path pointed, so
// imported rates could be invisible to the rate-book lookup.
async function appSchema(): Promise<string> {
  const { tableSchema } = await import('@/lib/db-schema');
  return tableSchema('contracts');
}

async function tableExists(): Promise<boolean> {
  const s = await appSchema();
  const rows = await prisma.$queryRawUnsafe<Array<{ table_name: string }>>(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = '${s}' AND table_name = 'dsr_items'`,
  );
  return rows.length > 0;
}

async function countByEdition(): Promise<Array<{ edition: string; count: number }>> {
  const s = await appSchema();
  const rows = await prisma.$queryRawUnsafe<Array<{ edition: string; count: bigint }>>(
    `SELECT "edition", COUNT(*) AS count FROM "${s}"."dsr_items" GROUP BY "edition" ORDER BY "edition"`,
  );
  return rows.map(row => ({ edition: row.edition, count: Number(row.count) }));
}

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const ready = await tableExists();
  return NextResponse.json({
    ready,
    available: BOOKS.map(book => ({ edition: book.edition, items: book.items.length, source: book.source })),
    loaded: ready ? await countByEdition() : [],
    message: ready
      ? 'Send a POST to load or refresh the schedules.'
      : 'Nothing loaded yet. A POST creates the table and loads the books.',
  });
}

export async function POST() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  // Create the table here rather than depend on the pending-changes page. That page
  // applies the same DDL, but it decides what to offer from what is missing, and a
  // deploy landing between the two left this endpoint waiting on a button that had
  // nothing to say. The statement is additive and safe to run twice, and this route is
  // already admin-only, so the importer owns the table it writes to.
  const s = await appSchema();
  if (!await tableExists()) {
    try {
      await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "${s}"."dsr_items" (
        "edition" TEXT NOT NULL,
        "code" TEXT NOT NULL,
        "subHead" TEXT NOT NULL,
        "subHeadName" TEXT NOT NULL,
        "description" TEXT NOT NULL,
        "unit" TEXT NOT NULL DEFAULT '',
        "rate" DOUBLE PRECISION,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "dsr_items_pkey" PRIMARY KEY ("edition", "code")
      )`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "dsr_items_code_idx" ON "${s}"."dsr_items" ("code")`);
    } catch (error: any) {
      console.error('could not create dsr_items:', error);
      return NextResponse.json(
        { error: `The dsr_items table could not be created: ${error?.message || 'unknown error'}` },
        { status: 500 },
      );
    }
  }

  try {
    let written = 0;
    for (const book of BOOKS) {
      // In batches, so one statement never carries the whole book. Re-running is a
      // refresh, not a duplication: a code already present is updated in place, which
      // is how a corrected extraction gets in without deleting anything first.
      const BATCH = 250;
      for (let start = 0; start < book.items.length; start += BATCH) {
        const batch = book.items.slice(start, start + BATCH);
        const values = batch.map((_, index) => {
          const base = index * 7;
          return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7})`;
        }).join(', ');
        const params = batch.flatMap(item => [book.edition, item.c, item.s, item.n, item.d, item.u, item.r]);
        await prisma.$executeRawUnsafe(
          `INSERT INTO "${s}"."dsr_items" ("edition","code","subHead","subHeadName","description","unit","rate")
           VALUES ${values}
           ON CONFLICT ("edition","code") DO UPDATE SET
             "subHead" = EXCLUDED."subHead",
             "subHeadName" = EXCLUDED."subHeadName",
             "description" = EXCLUDED."description",
             "unit" = EXCLUDED."unit",
             "rate" = EXCLUDED."rate",
             "updatedAt" = CURRENT_TIMESTAMP`,
          ...params,
        );
        written += batch.length;
      }
    }
    const loaded = await countByEdition();
    return NextResponse.json({
      written,
      loaded,
      message: `Loaded ${written} schedule items. ${loaded.map(row => `${row.edition}: ${row.count}`).join(', ')}.`,
    });
  } catch (error: any) {
    console.error('DSR import failed:', error);
    return NextResponse.json({ error: error?.message || 'Import failed' }, { status: 500 });
  }
}
