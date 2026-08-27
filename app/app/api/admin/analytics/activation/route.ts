import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { validateAdminAccess } from '@/lib/role-auth';

export const dynamic = 'force-dynamic';

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
