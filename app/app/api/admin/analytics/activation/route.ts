import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { validateAdminAccess } from '@/lib/role-auth';

export const dynamic = 'force-dynamic';

/**
 * Activation funnel for contractor signups — shows exactly where new users get
 * stuck between "signed up" and "created a bill", so the biggest drop-off is
 * visible instead of guessed at.
 */
export async function GET(request: NextRequest) {
  try {
    const { authorized, message } = await validateAdminAccess(request);
    if (!authorized) {
      return NextResponse.json({ error: message || 'Admin access required' }, { status: 403 });
    }

    // Focus on real customer accounts (contractors), not admins/officials.
    const base = { role: 'contractor' as const };
    const verified = { emailVerified: { not: null } };

    const [total, unverified, verifiedNoContract, contractNoBill, active, last7d] = await Promise.all([
      prisma.user.count({ where: base }),
      // Signed up but never verified their email → cannot log in / use the app.
      prisma.user.count({ where: { ...base, emailVerified: null } }),
      // Verified but never created a contract.
      prisma.user.count({ where: { ...base, ...verified, contracts: { none: {} } } }),
      // Verified, has a contract, but no bill on any of them.
      prisma.user.count({
        where: {
          AND: [base, verified, { contracts: { some: {} } }, { contracts: { none: { bills: { some: {} } } } }],
        },
      }),
      // Activated: verified with at least one bill.
      prisma.user.count({ where: { ...base, ...verified, contracts: { some: { bills: { some: {} } } } } }),
      // Signups in the last 7 days (context on how fresh the stuck users are).
      prisma.user.count({ where: { ...base, createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } } }),
    ]);

    const pct = (n: number) => (total > 0 ? Math.round((n / total) * 1000) / 10 : 0);

    return NextResponse.json({
      total,
      last7d,
      stages: {
        unverified: { count: unverified, pct: pct(unverified) },
        verifiedNoContract: { count: verifiedNoContract, pct: pct(verifiedNoContract) },
        contractNoBill: { count: contractNoBill, pct: pct(contractNoBill) },
        active: { count: active, pct: pct(active) },
      },
    });
  } catch (error) {
    console.error('activation analytics error:', error);
    return NextResponse.json({ error: 'Failed to load activation funnel' }, { status: 500 });
  }
}
