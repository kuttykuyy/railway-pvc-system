import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import {
  checkRailwayOfficialBillQuota,
  checkRailwayOfficialContractQuota,
} from '@/lib/admin-settings';

export const dynamic = 'force-dynamic';

/**
 * GET /api/user/quota
 * Returns the current Railway Official usage quotas.
 * Non-railway-official users get { applicable: false }.
 */
export async function GET(_req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, role: true, railwayZone: true },
    });

    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    if (user.role !== 'railway_official') {
      return NextResponse.json({ applicable: false });
    }

    const [billQuota, contractQuota] = await Promise.all([
      checkRailwayOfficialBillQuota(user.id),
      checkRailwayOfficialContractQuota(user.id),
    ]);

    return NextResponse.json({
      applicable: true,
      zone: user.railwayZone || null,   // locked zone for railway officials
      bills: billQuota,
      contracts: contractQuota,
    });
  } catch (err: any) {
    console.error('Quota API error:', err);
    return NextResponse.json({ error: 'Failed to fetch quota' }, { status: 500 });
  }
}
