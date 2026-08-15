import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user?.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const timeRange = searchParams.get('timeRange') || '30d'; // 7d, 30d, 90d, 1y, all

    // Calculate date range
    let startDate = new Date();
    switch (timeRange) {
      case '7d':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(startDate.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(startDate.getDate() - 90);
        break;
      case '1y':
        startDate.setFullYear(startDate.getFullYear() - 1);
        break;
      case 'all':
        startDate = new Date('2000-01-01');
        break;
    }

    // Total unique users and checks
    const totalStats = await prisma.pvcCheck.aggregate({
      where: { createdAt: { gte: startDate } },
      _count: true,
      _sum: { amount: true },
    });

    const uniqueUsers = await prisma.pvcCheck.findMany({
      where: { createdAt: { gte: startDate } },
      distinct: ['userId'],
      select: { userId: true },
    });

    // Monthly breakdown — raw SQL names its schema (search path is pooled roulette)
    const { schemaQualified } = await import('@/lib/db-schema');
    const pvcChecksT = await schemaQualified('pvc_checks');
    const monthlyData = (await prisma.$queryRawUnsafe(
      `SELECT
        DATE_TRUNC('month', "createdAt") as month,
        COUNT(*) as total_checks,
        COUNT(DISTINCT "userId") as unique_users,
        SUM("amount") as total_revenue
      FROM ${pvcChecksT}
      WHERE "createdAt" >= $1
      GROUP BY DATE_TRUNC('month', "createdAt")
      ORDER BY month DESC`,
      startDate,
    )) as any[];

    // Weekly breakdown (last 12 weeks)
    const weeklyStartDate = new Date();
    weeklyStartDate.setDate(weeklyStartDate.getDate() - 84); // 12 weeks
    const weeklyData = (await prisma.$queryRawUnsafe(
      `SELECT
        DATE_TRUNC('week', "createdAt") as week,
        COUNT(*) as total_checks,
        COUNT(DISTINCT "userId") as unique_users,
        SUM("amount") as total_revenue
      FROM ${pvcChecksT}
      WHERE "createdAt" >= $1
      GROUP BY DATE_TRUNC('week', "createdAt")
      ORDER BY week DESC`,
      weeklyStartDate,
    )) as any[];

    // Top contracts by usage
    const topContracts = await prisma.pvcCheck.groupBy({
      by: ['contractId'],
      where: { createdAt: { gte: startDate } },
      _count: true,
      _sum: { amount: true },
      orderBy: { _count: { contractId: 'desc' } },
      take: 10,
    });

    // Fetch contract details for top contracts
    const contractIds = topContracts.map((c) => c.contractId);
    const contracts = await prisma.contract.findMany({
      where: { id: { in: contractIds } },
      select: { id: true, agreementNo: true },
    }) as any[];

    const contractMap = new Map(contracts.map((c: any) => [c.id, c]));
    const topContractsWithDetails = topContracts.map((c) => {
      const contract = contractMap.get(c.contractId) as any;
      return {
        contractId: c.contractId,
        contractNumber: contract?.agreementNo || 'N/A',
        checkCount: c._count,
        revenue: c._sum.amount || 0,
      };
    });

    // Top users by usage
    const topUsers = await prisma.pvcCheck.groupBy({
      by: ['userId'],
      where: { createdAt: { gte: startDate } },
      _count: true,
      _sum: { amount: true },
      orderBy: { _count: { userId: 'desc' } },
      take: 10,
    });

    // Fetch user details for top users
    const userIds = topUsers.map((u) => u.userId);
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, email: true },
    }) as any[];

    const userMap = new Map(users.map((u: any) => [u.id, u]));
    const topUsersWithDetails = topUsers.map((u) => {
      const user = userMap.get(u.userId) as any;
      return {
        userId: u.userId,
        name: user?.name || 'Unknown',
        email: user?.email || 'N/A',
        checkCount: u._count,
        totalSpent: u._sum.amount || 0,
      };
    });

    // Revenue growth comparison (previous period)
    const previousStartDate = new Date(startDate);
    const rangeDays = Math.floor((new Date().getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    previousStartDate.setDate(previousStartDate.getDate() - rangeDays);
    
    const previousStats = await prisma.pvcCheck.aggregate({
      where: {
        createdAt: {
          gte: previousStartDate,
          lt: startDate,
        },
      },
      _count: true,
      _sum: { amount: true },
    });

    const checkGrowth = previousStats._count > 0 
      ? (((totalStats._count - previousStats._count) / previousStats._count) * 100).toFixed(1)
      : 'N/A';

    const revenueGrowth = (previousStats._sum.amount || 0) > 0
      ? (((((totalStats._sum.amount || 0) - (previousStats._sum.amount || 0)) / (previousStats._sum.amount || 0)) * 100)).toFixed(1)
      : 'N/A';

    return NextResponse.json({
      summary: {
        totalChecks: totalStats._count,
        totalUsers: uniqueUsers.length,
        totalRevenue: totalStats._sum.amount || 0,
        checkGrowth: parseFloat(checkGrowth as string),
        revenueGrowth: parseFloat(revenueGrowth as string),
        averageRevenuePerUser: uniqueUsers.length > 0 
          ? ((totalStats._sum.amount || 0) / uniqueUsers.length).toFixed(2)
          : '0',
      },
      monthlyData: monthlyData.map((m: any) => ({
        month: new Date(m.month).toLocaleDateString('en-IN', { 
          year: 'numeric', 
          month: 'short',
          timeZone: 'Asia/Kolkata'
        }),
        checks: Number(m.total_checks),
        users: Number(m.unique_users),
        revenue: Number(m.total_revenue) || 0,
      })),
      weeklyData: weeklyData.map((w: any) => ({
        week: new Date(w.week).toLocaleDateString('en-IN', { 
          year: 'numeric', 
          month: 'short',
          day: 'numeric',
          timeZone: 'Asia/Kolkata'
        }),
        checks: Number(w.total_checks),
        users: Number(w.unique_users),
        revenue: Number(w.total_revenue) || 0,
      })),
      topContracts: topContractsWithDetails,
      topUsers: topUsersWithDetails,
    });
  } catch (error) {
    console.error('Analytics error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch analytics' },
      { status: 500 }
    );
  }
}
