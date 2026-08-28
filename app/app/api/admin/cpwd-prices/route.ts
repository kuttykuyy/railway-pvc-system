import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { CPWD_SEED_ROWS, CPWD_MATERIALS, type CpwdMaterial } from '@/lib/cpwd-prices';

export const dynamic = 'force-dynamic';

/**
 * The CPWD 10CA material-price feed (Engine B), admin-managed. GET reports whether the
 * table exists and lists what is loaded; POST creates the table if needed and upserts
 * rows — a seed action loads the verified Delhi-NCR base + recent month, and a rows action
 * upserts a submitted month's prices.
 *
 * The table is created here rather than via a migration, the same additive raw-SQL pattern
 * the DSR rate-book importer uses, so no schema.prisma model is declared ahead of the DB.
 */

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return { ok: false as const, status: 401, error: 'Unauthorized' };
  const user = await prisma.user.findUnique({ where: { email: session.user.email }, select: { role: true } });
  if (user?.role !== 'admin' && user?.role !== 'superadmin') {
    return { ok: false as const, status: 403, error: 'Admin access required' };
  }
  return { ok: true as const };
}

async function appSchema(): Promise<string> {
  const { tableSchema } = await import('@/lib/db-schema');
  return tableSchema('contracts');
}

async function tableExists(s: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ table_name: string }>>(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = '${s}' AND table_name = 'cpwd_material_prices'`,
  );
  return rows.length > 0;
}

async function createTable(s: string): Promise<void> {
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "${s}"."cpwd_material_prices" (
    "region" TEXT NOT NULL,
    "material" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "aipi" DOUBLE PRECISION,
    "unit" TEXT NOT NULL DEFAULT 'MT',
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "cpwd_material_prices_pkey" PRIMARY KEY ("region", "material", "month")
  )`);
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "cpwd_material_prices_region_material_idx" ON "${s}"."cpwd_material_prices" ("region", "material")`,
  );
}

async function loadedSummary(s: string): Promise<{ rows: number; regions: string[]; latestMonth: string | null }> {
  const [{ count }] = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
    `SELECT COUNT(*) AS count FROM "${s}"."cpwd_material_prices"`,
  );
  const regions = await prisma.$queryRawUnsafe<Array<{ region: string }>>(
    `SELECT DISTINCT "region" FROM "${s}"."cpwd_material_prices" ORDER BY "region"`,
  );
  const latest = await prisma.$queryRawUnsafe<Array<{ month: string }>>(
    `SELECT MAX("month") AS month FROM "${s}"."cpwd_material_prices"`,
  );
  return { rows: Number(count), regions: regions.map(r => r.region), latestMonth: latest[0]?.month || null };
}

async function upsertRows(s: string, rows: Array<{ region: string; material: string; month: string; price: number; aipi: number | null }>): Promise<number> {
  const { CPWD_MATERIAL_META } = await import('@/lib/cpwd-prices');
  let written = 0;
  for (const r of rows) {
    const unit = (CPWD_MATERIAL_META as any)[r.material]?.unit || 'MT';
    await prisma.$executeRawUnsafe(
      `INSERT INTO "${s}"."cpwd_material_prices" ("region","material","month","price","aipi","unit")
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT ("region","material","month") DO UPDATE SET
         "price" = EXCLUDED."price", "aipi" = EXCLUDED."aipi", "unit" = EXCLUDED."unit", "updatedAt" = CURRENT_TIMESTAMP`,
      r.region, r.material, r.month, r.price, r.aipi, unit,
    );
    written += 1;
  }
  return written;
}

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const s = await appSchema();
  const ready = await tableExists(s);
  // The actual loaded rows so the admin can browse them, newest month first.
  let rows: Array<{ region: string; month: string; material: string; price: number; aipi: number | null }> = [];
  if (ready) {
    const raw = await prisma.$queryRawUnsafe<Array<{ region: string; month: string; material: string; price: number; aipi: number | null }>>(
      `SELECT "region","month","material","price","aipi" FROM "${s}"."cpwd_material_prices" ORDER BY "region", "month" DESC, "material"`,
    );
    rows = raw.map(r => ({ ...r, price: Number(r.price), aipi: r.aipi == null ? null : Number(r.aipi) }));
  }
  return NextResponse.json({
    ready,
    materials: CPWD_MATERIALS,
    loaded: ready ? await loadedSummary(s) : { rows: 0, regions: [], latestMonth: null },
    rows,
    message: ready ? 'Feed table exists.' : 'No feed table yet. Seed it to create and load the verified Delhi-NCR data.',
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json().catch(() => ({}));
  const action = ['rows', 'fetch-nsr'].includes(body?.action) ? body.action : 'seed';
  const s = await appSchema();

  try {
    if (!await tableExists(s)) await createTable(s);

    if (action === 'seed') {
      const written = await upsertRows(s, CPWD_SEED_ROWS as any);
      return NextResponse.json({ written, loaded: await loadedSummary(s), message: `Seeded ${written} verified rows (Delhi NCR).` });
    }

    if (action === 'fetch-nsr') {
      // Auto-import the monthly history NSRCivil aggregates from the CPWD circulars.
      const { fetchCpwd10caFromNsr } = await import('@/lib/cpwd-price-fetcher');
      const rows = await fetchCpwd10caFromNsr();
      const written = await upsertRows(s, rows as any);
      const months = Array.from(new Set(rows.map(r => r.month))).sort();
      return NextResponse.json({
        written,
        loaded: await loadedSummary(s),
        message: `Imported ${written} rows across ${months.length} months (${months[0]} → ${months[months.length - 1]}) from NSRCivil. Verify against the official CPWD circular before a real claim.`,
      });
    }

    // action 'rows' — upsert a submitted month's prices.
    const region = String(body?.region || '').trim().toLowerCase();
    const month = String(body?.month || '').trim();
    const prices = body?.prices && typeof body.prices === 'object' ? body.prices : {};
    if (!region || !/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json({ error: 'A region and a month (YYYY-MM) are required.' }, { status: 400 });
    }
    const rows = CPWD_MATERIALS
      .filter((m: CpwdMaterial) => prices[m] != null && prices[m] !== '' && Number.isFinite(Number(prices[m])))
      .map((m: CpwdMaterial) => ({ region, material: m, month, price: Number(prices[m]), aipi: prices[`${m}_aipi`] != null && prices[`${m}_aipi`] !== '' ? Number(prices[`${m}_aipi`]) : null }));
    if (rows.length === 0) {
      return NextResponse.json({ error: 'No valid material prices were provided.' }, { status: 400 });
    }
    const written = await upsertRows(s, rows);
    return NextResponse.json({ written, loaded: await loadedSummary(s), message: `Saved ${written} price${written === 1 ? '' : 's'} for ${region} ${month}.` });
  } catch (error: any) {
    console.error('cpwd-prices write failed:', error);
    return NextResponse.json({ error: error?.message || 'Could not write the CPWD prices.' }, { status: 500 });
  }
}
