/**
 * Load the CPWD Delhi Schedule of Rates into the database.
 *
 * The book ships with the app as data/dsr-2021.json — extracted from the two official
 * volumes by scripts/extract-dsr-book.ts — rather than being uploaded, because the
 * whole schedule is well past the request size a deployment will accept and because a
 * rate book that decides money should be the same for everyone, not whatever file
 * happened to be uploaded last.
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

export const dynamic = 'force-dynamic';

interface PackedItem { c: string; s: string; n: string; d: string; u: string; r: number | null }
interface Book { edition: string; source: string; items: PackedItem[] }

const BOOKS: Book[] = [dsr2021 as Book];

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

async function tableExists(): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ table_name: string }>>(
    `SELECT table_name FROM information_schema.tables WHERE table_name = 'dsr_items'`,
  );
  return rows.length > 0;
}

async function countByEdition(): Promise<Array<{ edition: string; count: number }>> {
  const rows = await prisma.$queryRawUnsafe<Array<{ edition: string; count: bigint }>>(
    `SELECT "edition", COUNT(*) AS count FROM "dsr_items" GROUP BY "edition" ORDER BY "edition"`,
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
      ? 'Send a POST to load or refresh the schedule.'
      : 'The dsr_items table does not exist yet — apply the pending database change first.',
  });
}

export async function POST() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!await tableExists()) {
    return NextResponse.json(
      { error: 'The dsr_items table does not exist yet. Apply the pending database change first.' },
      { status: 409 },
    );
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
          `INSERT INTO "dsr_items" ("edition","code","subHead","subHeadName","description","unit","rate")
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
