import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getClientRoleInfo } from '@/lib/role-auth-client';

export const dynamic = 'force-dynamic';

// PATCH /api/admin/users/[userId]/contract-limit
// Sets or clears a per-user contract limit override for a Railway Official
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params;
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const roleInfo = getClientRoleInfo(session);
    if (!roleInfo.isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json();
    // contractLimitOverride: number | null  (null = revert to global default)
    const { contractLimitOverride } = body;

    if (contractLimitOverride !== null && (typeof contractLimitOverride !== 'number' || contractLimitOverride < 0 || !Number.isInteger(contractLimitOverride))) {
      return NextResponse.json({ error: 'contractLimitOverride must be a non-negative integer or null' }, { status: 400 });
    }

    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    if (target.role !== 'railway_official') {
      return NextResponse.json({ error: 'Only Railway Official users can have a contract limit override' }, { status: 400 });
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { contractLimitOverride: contractLimitOverride ?? null },
      select: { id: true, contractLimitOverride: true },
    });

    return NextResponse.json({ success: true, contractLimitOverride: updated.contractLimitOverride });
  } catch (err: any) {
    console.error('Contract limit override error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
