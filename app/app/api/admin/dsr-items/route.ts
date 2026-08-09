/**
 * Search the loaded schedules of rates.
 *
 * Reads what /api/admin/dsr-items/import wrote. A code is looked up exactly first —
 * that is how anyone arrives here, holding an item number off a bill — and the text
 * search is the fallback for when you know the work but not the number.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

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

export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const params = request.nextUrl.searchParams;
  const query = (params.get('q') || '').trim();
  const edition = (params.get('edition') || '').trim();
  const page = Math.max(1, Number(params.get('page') || 1) || 1);

  try {
    const editions = await prisma.dsrItem.groupBy({
      by: ['edition'],
      _count: { _all: true },
      orderBy: { edition: 'asc' },
    });

    const where: any = {};
    if (edition) where.edition = edition;
    if (query) {
      // A bill writes a code with spaces or dashes ("1710 14"), so the code search
      // ignores them. Description search is plain contains — these are a few thousand
      // rows, not a corpus.
      const bare = query.replace(/[\s.\-/]/g, '');
      where.OR = [
        { code: { equals: query } },
        { code: { equals: bare } },
        { code: { startsWith: query } },
        { description: { contains: query, mode: 'insensitive' } },
        { subHeadName: { contains: query, mode: 'insensitive' } },
      ];
    }

    const [total, items] = await Promise.all([
      prisma.dsrItem.count({ where }),
      prisma.dsrItem.findMany({
        where,
        orderBy: [{ edition: 'asc' }, { code: 'asc' }],
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
    ]);

    return NextResponse.json({
      editions: editions.map(row => ({ edition: row.edition, count: row._count._all })),
      total,
      page,
      pageSize: PAGE_SIZE,
      items,
    });
  } catch (error: any) {
    // Before the table is applied this is the honest answer, not a 500.
    if (/dsr_items/.test(String(error?.message))) {
      return NextResponse.json({ editions: [], total: 0, page: 1, pageSize: PAGE_SIZE, items: [], notLoaded: true });
    }
    console.error('rate book search failed:', error);
    return NextResponse.json({ error: error?.message || 'Search failed' }, { status: 500 });
  }
}
