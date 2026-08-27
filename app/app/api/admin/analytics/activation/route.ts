import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { validateAdminAccess } from '@/lib/role-auth';

export const dynamic = 'force-dynamic';

// How many stuck users a drill-down returns at most, newest first.
const STUCK_LIST_CAP = 500;

/**
 * User-movement funnel for contractor signups — the ordered journey from "signed up"
 * to "paid", each stage a strict subset of the one before, so the drop-off between any
 * two steps is exactly the users who reached the first and not the next. Shows where
 * people fall out instead of guessing.
 *
 * "Paid" is a credit top-up written by the payment path (a type:'add' credit whose
 * reason names the gateway order), scoped to users who already billed — admin credit
 * grants use type:'add' too, but with a different reason, and are not counted.
 */
export async function GET(request: NextRequest) {
  try {
    const { authorized, message } = await validateAdminAccess(request);
    if (!authorized) {
      return NextResponse.json({ error: message || 'Admin access required' }, { status: 403 });
    }

    // Real customer accounts (contractors), not admins/officials.
    const base = { role: 'contractor' as const };
    const verified = { emailVerified: { not: null } };
    const hasBill = { contracts: { some: { bills: { some: {} } } } };
    // A genuine gateway top-up, not an admin grant (see the note above).
    const paidTopup = {
      creditTransactions: { some: { type: 'add', reason: { contains: 'payment', mode: 'insensitive' as const } } },
    };

    // Drill-down: the actual people stuck AT a stage — reached the previous milestone
    // but not the next — so an admin can see who to nudge and, from the columns, why.
    const stuck = request.nextUrl.searchParams.get('stuck');
    if (stuck) {
      const stuckWhere: Record<string, any> = {
        // Signed up but never verified → cannot even log in.
        'unverified':  { ...base, emailVerified: null },
        // Verified, but never created a contract.
        'no-contract': { ...base, ...verified, contracts: { none: {} } },
        // Has a contract, but no bill on any of them (never uploaded/entered a bill).
        'no-bill':     { ...base, ...verified, contracts: { some: {} }, NOT: { ...hasBill } },
        // Billed, but never paid for credits through a gateway.
        'no-payment':  { ...base, ...verified, ...hasBill, NOT: { ...paidTopup } },
      }[stuck];

      if (!stuckWhere) {
        return NextResponse.json({ error: 'Unknown stage' }, { status: 400 });
      }

      const users = await prisma.user.findMany({
        where: stuckWhere,
        orderBy: { createdAt: 'desc' },
        take: STUCK_LIST_CAP,
        select: {
          id: true, name: true, email: true, phone: true, companyName: true,
          createdAt: true, lastLoginAt: true, emailVerified: true,
          _count: { select: { contracts: true } },
        },
      });

      const totalStuck = await prisma.user.count({ where: stuckWhere });
      return NextResponse.json({
        stuck,
        total: totalStuck,
        returned: users.length,
        capped: totalStuck > STUCK_LIST_CAP,
        users: users.map(u => ({
          id: u.id,
          name: u.name,
          email: u.email,
          phone: u.phone,
          companyName: u.companyName,
          createdAt: u.createdAt,
          lastLoginAt: u.lastLoginAt,
          verified: u.emailVerified != null,
          contracts: u._count.contracts,
        })),
      });
    }

    const [total, reachedVerified, reachedContract, reachedBill, reachedPaid, last7d] = await Promise.all([
      // Signed up.
      prisma.user.count({ where: base }),
      // Verified their email → can actually log in and use the app.
      prisma.user.count({ where: { ...base, ...verified } }),
      // Verified and created at least one contract.
      prisma.user.count({ where: { ...base, ...verified, contracts: { some: {} } } }),
      // …and put a bill on one of them.
      prisma.user.count({ where: { ...base, ...verified, ...hasBill } }),
      // …and paid for credits through a gateway.
      prisma.user.count({ where: { ...base, ...verified, ...hasBill, ...paidTopup } }),
      // Signups in the last 7 days — context on how fresh the stuck users are.
      prisma.user.count({ where: { ...base, createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } } }),
    ]);

    // Ordered, monotonically-decreasing reached-counts. The page turns these into
    // step conversions and drop-offs so the shape stays a single source of truth.
    const funnel = [
      { key: 'signup', label: 'Signed up', count: total },
      { key: 'verified', label: 'Verified email', count: reachedVerified },
      { key: 'contract', label: 'Created a contract', count: reachedContract },
      { key: 'bill', label: 'Created a bill', count: reachedBill },
      { key: 'paid', label: 'Paid for credits', count: reachedPaid },
    ];

    return NextResponse.json({ total, last7d, funnel });
  } catch (error) {
    console.error('activation analytics error:', error);
    return NextResponse.json({ error: 'Failed to load activation funnel' }, { status: 500 });
  }
}
