import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { schemaQualified } from '@/lib/db-schema';

export const dynamic = 'force-dynamic';

/**
 * The signup funnel: everyone who signed up in the window, how far each of them got,
 * and where they were last seen.
 *
 * Stages are read off what the person has actually done, in the order the product
 * asks for it: sign up → verify email → sign in → create a contract → create a bill →
 * pay for one. The last page visited comes from page_views, so a person who stalled
 * shows the screen they stalled on rather than a blank.
 */
async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;
  const user = await prisma.user.findUnique({ where: { email: session.user.email }, select: { role: true } });
  return user?.role === 'admin' || user?.role === 'superadmin' ? session : null;
}

const FUNNEL_STAGES = ['signed_up', 'email_verified', 'signed_in', 'contract_created', 'bill_created', 'paid'] as const;
type FunnelStage = typeof FUNNEL_STAGES[number];

export async function GET(request: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  const days = Math.min(365, Math.max(1, Number(new URL(request.url).searchParams.get('days')) || 30));
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const users = await prisma.user.findMany({
    where: { createdAt: { gte: since }, role: { notIn: ['admin', 'superadmin'] } },
    select: { id: true, name: true, email: true, role: true, phone: true, createdAt: true, emailVerified: true, lastLoginAt: true, companyName: true },
    orderBy: { createdAt: 'desc' },
  });
  const ids = users.map(u => u.id);
  if (ids.length === 0) {
    return NextResponse.json({ days, stages: FUNNEL_STAGES, counts: Object.fromEntries(FUNNEL_STAGES.map(s => [s, 0])), users: [], pageViewsAvailable: true });
  }

  const [contracts, bills, paid] = await Promise.all([
    prisma.contract.groupBy({ by: ['userId'], where: { userId: { in: ids } }, _min: { createdAt: true }, _count: { _all: true } }),
    prisma.bill.findMany({
      where: { contract: { userId: { in: ids } } },
      select: { createdAt: true, contract: { select: { userId: true } } },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.billTransaction.findMany({
      where: { userId: { in: ids }, status: { in: ['paid', 'completed', 'success'] }, isFree: false },
      select: { userId: true, paidAt: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    }),
  ]);
  const firstContract = new Map<string, { at: Date; count: number }>();
  for (const c of contracts) if (c.userId) firstContract.set(c.userId, { at: c._min.createdAt!, count: c._count._all });
  const firstBill = new Map<string, Date>();
  const billCount = new Map<string, number>();
  for (const b of bills) {
    const uid = b.contract.userId; if (!uid) continue;
    if (!firstBill.has(uid)) firstBill.set(uid, b.createdAt);
    billCount.set(uid, (billCount.get(uid) || 0) + 1);
  }
  const firstPaid = new Map<string, Date>();
  for (const p of paid) if (!firstPaid.has(p.userId)) firstPaid.set(p.userId, p.paidAt || p.createdAt);

  // Last seen: the latest page view per user, plus their last few distinct pages so the
  // path they took is readable at a glance.
  let pageViewsAvailable = true;
  const lastSeen = new Map<string, { path: string; at: Date }>();
  const trail = new Map<string, string[]>();
  const viewCount = new Map<string, number>();
  try {
    const table = await schemaQualified('page_views');
    const rows = await prisma.$queryRawUnsafe<Array<{ userId: string; path: string; createdAt: Date }>>(
      `SELECT "userId", "path", "createdAt" FROM ${table} WHERE "userId" = ANY($1::text[]) ORDER BY "createdAt" DESC`, ids);
    for (const r of rows) {
      viewCount.set(r.userId, (viewCount.get(r.userId) || 0) + 1);
      if (!lastSeen.has(r.userId)) lastSeen.set(r.userId, { path: r.path, at: r.createdAt });
      const t = trail.get(r.userId) || [];
      if (t.length < 6 && t[t.length - 1] !== r.path) t.push(r.path);
      trail.set(r.userId, t);
    }
  } catch {
    pageViewsAvailable = false;
  }

  const rowsOut = users.map(u => {
    const contract = firstContract.get(u.id);
    const stage: FunnelStage =
      firstPaid.has(u.id) ? 'paid'
      : firstBill.has(u.id) ? 'bill_created'
      : contract ? 'contract_created'
      : u.lastLoginAt ? 'signed_in'
      : u.emailVerified ? 'email_verified'
      : 'signed_up';
    const seen = lastSeen.get(u.id);
    return {
      id: u.id, name: u.name, email: u.email, role: u.role, companyName: u.companyName, phone: !!u.phone,
      signedUpAt: u.createdAt, emailVerifiedAt: u.emailVerified, lastLoginAt: u.lastLoginAt,
      firstContractAt: contract?.at || null, contracts: contract?.count || 0,
      firstBillAt: firstBill.get(u.id) || null, bills: billCount.get(u.id) || 0,
      firstPaidAt: firstPaid.get(u.id) || null,
      stage,
      lastPath: seen?.path || null, lastSeenAt: seen?.at || null,
      // Most recent first, as recorded.
      trail: trail.get(u.id) || [],
      pageViews: viewCount.get(u.id) || 0,
    };
  });

  // Cumulative: a person who paid also counts at every earlier stage.
  const rank = (s: FunnelStage) => FUNNEL_STAGES.indexOf(s);
  const counts = Object.fromEntries(FUNNEL_STAGES.map(s => [s, rowsOut.filter(r => rank(r.stage) >= rank(s)).length]));
  // Where people who have NOT progressed were last seen — the pages that lose them.
  const dropPages = new Map<string, number>();
  for (const r of rowsOut) {
    if (r.stage === 'paid' || !r.lastPath) continue;
    dropPages.set(r.lastPath, (dropPages.get(r.lastPath) || 0) + 1);
  }
  const lastSeenPages = [...dropPages.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([path, n]) => ({ path, users: n }));

  return NextResponse.json({ days, stages: FUNNEL_STAGES, counts, users: rowsOut, lastSeenPages, pageViewsAvailable });
}
