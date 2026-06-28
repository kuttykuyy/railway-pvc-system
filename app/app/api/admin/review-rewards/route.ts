import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { validateAdminAccess } from '@/lib/role-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { authorized, message } = await validateAdminAccess(request);
  if (!authorized) {
    return NextResponse.json({ error: message || 'Admin access required' }, { status: 403 });
  }

  const status = request.nextUrl.searchParams.get('status') || 'pending';
  const where = status === 'all' ? {} : { status };

  const submissions = await prisma.reviewRewardSubmission.findMany({
    where,
    include: {
      user: {
        select: {
          name: true,
          email: true,
          phone: true,
          customerAccount: { select: { creditBalance: true } },
        },
      },
    },
    orderBy: { submittedAt: 'desc' },
  });

  return NextResponse.json({ submissions });
}
