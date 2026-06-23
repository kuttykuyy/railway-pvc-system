import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import {
  ensureUserReferralCode,
  REFERRAL_MINIMUM_TOPUP,
  REFERRAL_MONTHLY_REWARD_LIMIT,
  REFERRAL_REWARD,
} from '@/lib/referrals';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  });
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const referralCode = await ensureUserReferralCode(user.id);
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [referrals, statusCounts, totalRewards, monthlyRewards] = await Promise.all([
    prisma.referral.findMany({
      where: { referrerUserId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        status: true,
        createdAt: true,
        rewardedAt: true,
        rejectionReason: true,
        referrerReward: true,
        referredUser: {
          select: { name: true, email: true },
        },
      },
    }),
    prisma.referral.groupBy({
      by: ['status'],
      where: { referrerUserId: user.id },
      _count: { _all: true },
    }),
    prisma.referral.aggregate({
      where: { referrerUserId: user.id, status: 'rewarded' },
      _sum: { referrerReward: true },
    }),
    prisma.referral.count({
      where: {
        referrerUserId: user.id,
        status: 'rewarded',
        rewardedAt: { gte: monthStart },
      },
    }),
  ]);

  const countByStatus = Object.fromEntries(
    statusCounts.map((item) => [item.status, item._count._all])
  );
  const totalInvited = statusCounts.reduce((sum, item) => sum + item._count._all, 0);
  const origin = request.headers.get('origin') || process.env.NEXTAUTH_URL || 'https://www.irpvc.in';
  const referralLink = `${origin.replace(/\/$/, '')}/auth/signup?ref=${encodeURIComponent(referralCode)}`;

  return NextResponse.json({
    referralCode,
    referralLink,
    rules: {
      reward: REFERRAL_REWARD,
      minimumTopup: REFERRAL_MINIMUM_TOPUP,
      monthlyLimit: REFERRAL_MONTHLY_REWARD_LIMIT,
    },
    stats: {
      totalInvited,
      pending: countByStatus.signed_up || 0,
      rewarded: countByStatus.rewarded || 0,
      rejected: countByStatus.rejected || 0,
      totalEarned: totalRewards._sum.referrerReward || 0,
      rewardedThisMonth: monthlyRewards,
    },
    referrals: referrals.map((referral) => ({
      id: referral.id,
      name: referral.referredUser.name || 'New contractor',
      email: referral.referredUser.email.replace(
        /^(.{2}).*(@.*)$/,
        '$1***$2'
      ),
      status: referral.status,
      joinedAt: referral.createdAt,
      rewardedAt: referral.rewardedAt,
      reward: referral.status === 'rewarded' ? referral.referrerReward : 0,
      rejectionReason: referral.rejectionReason,
    })),
  });
}
