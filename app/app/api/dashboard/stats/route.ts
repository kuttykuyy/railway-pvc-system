
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { advancedCache } from '@/lib/advanced-cache';

// Force dynamic rendering for this route
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const cacheKey = `dashboard:stats:${user.id}`;
    const cachedStats = advancedCache.get(cacheKey);
    if (cachedStats) {
      return NextResponse.json(cachedStats);
    }

    const isAdmin = user.role === 'admin';

    // Get date ranges
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);

    let whereClause: { userId?: string } = {};
    if (!isAdmin) {
      // Regular users see only their data
      whereClause = { userId: user.id };
    }

    // Fetch dashboard statistics
    const [
      totalContracts,
      totalBills,
      pendingBills,
      thisMonthBills,
      recentBills,
      totalTransactions,
    ] = await Promise.all([
      // Total contracts
      prisma.contract.count({
        where: whereClause,
      }),

      // Total bills
      prisma.bill.count({
        where: {
          contract: whereClause.userId ? { userId: whereClause.userId } : undefined,
        },
      }),

      // Pending bills (you might need to adjust based on your bill status logic)
      prisma.bill.count({
        where: {
          contract: whereClause.userId ? { userId: whereClause.userId } : undefined,
          // Add pending status condition if you have one
        },
      }),

      // This month's bills
      prisma.bill.count({
        where: {
          contract: whereClause.userId ? { userId: whereClause.userId } : undefined,
          createdAt: {
            gte: startOfMonth,
          },
        },
      }),

      // Recent bills for activity count
      prisma.bill.count({
        where: {
          contract: whereClause.userId ? { userId: whereClause.userId } : undefined,
          createdAt: {
            gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
          },
        },
      }),

      // Total transaction amount
      prisma.billTransaction.aggregate({
        where: {
          userId: isAdmin ? undefined : user.id,
          status: 'paid',
        },
        _sum: {
          amount: true,
        },
      }),
    ]);

    // Calculate processing rate (simple calculation)
    const processingRate = totalBills > 0 ? Math.round((totalBills / (totalBills + pendingBills)) * 100) : 0;

    const stats = {
      totalContracts,
      totalBills,
      pendingBills,
      recentActivity: recentBills,
      totalRevenue: totalTransactions._sum.amount || 0,
      thisMonthBills,
      processingRate,
    };

    // Cache for 30 seconds, tagged by dashboard and specific user ID
    advancedCache.set(cacheKey, stats, 30000, ['dashboard', `user:${user.id}`]);

    return NextResponse.json(stats);
  } catch (error) {
    console.error('Dashboard stats error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
