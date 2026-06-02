
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

// Force dynamic rendering for this route
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const userId = (session.user as any).id as string;
    const isAdmin = (session.user as any).role === 'admin';

    // Date ranges for analytics
    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const firstDayOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastDayOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, 1);

    // Build filter based on role
    const contractFilter = isAdmin ? {} : { userId };
    const billFilter = isAdmin ? {} : { contract: { userId } };

    // 1. Overview Statistics
    const [
      totalContracts,
      activeContracts,
      totalBills,
      paidBills,
      pendingBills,
      currentMonthBills,
      lastMonthBills,
    ] = await Promise.all([
      prisma.contract.count({ where: contractFilter }),
      prisma.contract.count({
        where: {
          ...contractFilter,
          bills: { some: {} }
        }
      }),
      prisma.bill.count({ where: billFilter }),
      prisma.billTransaction.count({
        where: {
          status: 'paid',
          bill: billFilter
        }
      }),
      prisma.billTransaction.count({
        where: {
          status: 'pending',
          bill: billFilter
        }
      }),
      prisma.bill.count({
        where: {
          ...billFilter,
          createdAt: { gte: firstDayOfMonth }
        }
      }),
      prisma.bill.count({
        where: {
          ...billFilter,
          createdAt: { gte: firstDayOfLastMonth, lte: lastDayOfLastMonth }
        }
      }),
    ]);

    // 2. Revenue Analytics
    const revenueData = await prisma.billTransaction.aggregate({
      where: {
        bill: billFilter,
        status: 'paid'
      },
      _sum: {
        amount: true
      }
    });

    const pendingRevenue = await prisma.billTransaction.aggregate({
      where: {
        bill: billFilter,
        status: 'pending'
      },
      _sum: {
        amount: true
      }
    });

    const currentMonthRevenue = await prisma.billTransaction.aggregate({
      where: {
        bill: billFilter,
        status: 'paid',
        paidAt: { gte: firstDayOfMonth }
      },
      _sum: {
        amount: true
      }
    });

    // 3. PVC Statistics
    const pvcData = await prisma.pvcCalculation.aggregate({
      where: {
        bill: billFilter
      },
      _sum: {
        totalPvc: true,
        cumulativePvc: true
      },
      _avg: {
        totalPvc: true
      }
    });

    // 4. Monthly Trends (Last 6 months)
    const monthlyBills = isAdmin
      ? await prisma.$queryRaw<Array<{
          month: string;
          count: bigint;
          revenue: number | null;
        }>>`
          SELECT 
            TO_CHAR(b."createdAt", 'YYYY-MM') as month,
            COUNT(b.id) as count,
            COALESCE(SUM(bt.amount), 0) as revenue
          FROM "bills" b
          LEFT JOIN "bill_transactions" bt ON bt."billId" = b.id AND bt.status = 'paid'
          WHERE b."createdAt" >= ${sixMonthsAgo}
          GROUP BY TO_CHAR(b."createdAt", 'YYYY-MM')
          ORDER BY month ASC
        `
      : await prisma.$queryRaw<Array<{
          month: string;
          count: bigint;
          revenue: number | null;
        }>>`
          SELECT 
            TO_CHAR(b."createdAt", 'YYYY-MM') as month,
            COUNT(b.id) as count,
            COALESCE(SUM(bt.amount), 0) as revenue
          FROM "bills" b
          LEFT JOIN "bill_transactions" bt ON bt."billId" = b.id AND bt.status = 'paid'
          INNER JOIN "contracts" c ON b."contractId" = c.id
          WHERE c."userId" = ${userId}
            AND b."createdAt" >= ${sixMonthsAgo}
          GROUP BY TO_CHAR(b."createdAt", 'YYYY-MM')
          ORDER BY month ASC
        `;

    // 5. Contract Value Analytics
    const contractValues = await prisma.contract.aggregate({
      where: contractFilter,
      _sum: {
        contractValue: true,
        tenderAdvertisedValue: true
      },
      _avg: {
        contractValue: true
      }
    });

    // 6. Recent Activity (Last 10 items)
    const recentBills = await prisma.bill.findMany({
      where: billFilter,
      take: 10,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        billNo: true,
        billAmount: true,
        quarter: true,
        createdAt: true,
        contract: {
          select: {
            agreementNo: true,
            contractorName: true,
            workDescription: true
          }
        }
      }
    });

    // 7. Top Contracts by Bill Count
    const topContracts = await prisma.contract.findMany({
      where: contractFilter,
      take: 5,
      select: {
        id: true,
        agreementNo: true,
        contractorName: true,
        workDescription: true,
        contractValue: true,
        _count: {
          select: { bills: true }
        }
      },
      orderBy: {
        bills: { _count: 'desc' }
      }
    });

    // 8. Work Classification Distribution
    const classificationStats = await prisma.bill.groupBy({
      by: ['workClassificationId'],
      where: billFilter,
      _count: {
        id: true
      },
      _sum: {
        billAmount: true
      }
    });

    // Get classification details
    const classificationIds = classificationStats
      .map(s => s.workClassificationId)
      .filter((id): id is string => id !== null);
    
    const classifications = await prisma.classification.findMany({
      where: { id: { in: classificationIds } },
      select: { id: true, code: true, name: true }
    });

    const classificationMap = new Map(classifications.map((c: any) => [c.id, c]));

    const classificationDistribution = classificationStats.map((stat: any) => ({
      classification: stat.workClassificationId 
        ? (classificationMap.get(stat.workClassificationId) as any)?.name || 'Unknown'
        : 'Unclassified',
      code: stat.workClassificationId
        ? (classificationMap.get(stat.workClassificationId) as any)?.code || ''
        : '',
      count: stat._count.id,
      totalAmount: stat._sum.billAmount || 0
    }));

    // 9. Payment Success Rate
    const totalTransactions = await prisma.billTransaction.count({
      where: { bill: billFilter }
    });
    
    const successfulTransactions = await prisma.billTransaction.count({
      where: {
        bill: billFilter,
        status: 'paid'
      }
    });

    const paymentSuccessRate = totalTransactions > 0 
      ? (successfulTransactions / totalTransactions) * 100 
      : 0;

    // 10. User Statistics (for admin)
    let userStats = null;
    if (isAdmin) {
      const [totalUsers, activeUsers, trialUsers] = await Promise.all([
        prisma.user.count(),
        prisma.user.count({
          where: {
            contracts: { some: { bills: { some: {} } } }
          }
        }),
        prisma.user.count({
          where: {
            pvcToolSubscriptionActive: true,
            pvcToolSubscriptionExpiry: { gte: new Date() }
          }
        })
      ]);

      userStats = {
        totalUsers,
        activeUsers,
        trialUsers
      };
    }

    // Calculate growth percentages
    const billGrowth = lastMonthBills > 0
      ? ((currentMonthBills - lastMonthBills) / lastMonthBills) * 100
      : currentMonthBills > 0 ? 100 : 0;

    // Prepare response
    const dashboardData = {
      overview: {
        totalContracts,
        activeContracts,
        totalBills,
        paidBills,
        pendingBills,
        currentMonthBills,
        lastMonthBills,
        billGrowth: Math.round(billGrowth * 10) / 10
      },
      revenue: {
        totalRevenue: revenueData._sum.amount || 0,
        pendingRevenue: pendingRevenue._sum.amount || 0,
        currentMonthRevenue: currentMonthRevenue._sum.amount || 0
      },
      pvc: {
        totalPvc: pvcData._sum.totalPvc || 0,
        cumulativePvc: pvcData._sum.cumulativePvc || 0,
        averagePvc: pvcData._avg.totalPvc || 0
      },
      contracts: {
        totalValue: contractValues._sum.contractValue || 0,
        totalTenderValue: contractValues._sum.tenderAdvertisedValue || 0,
        averageValue: contractValues._avg.contractValue || 0
      },
      monthlyTrends: monthlyBills.map(item => ({
        month: item.month,
        count: Number(item.count),
        revenue: item.revenue || 0
      })),
      recentActivity: recentBills,
      topContracts: topContracts.map(c => ({
        ...c,
        billCount: c._count.bills
      })),
      classificationDistribution,
      paymentMetrics: {
        totalTransactions,
        successfulTransactions,
        successRate: Math.round(paymentSuccessRate * 10) / 10
      },
      userStats,
      generatedAt: new Date().toISOString()
    };

    return NextResponse.json(dashboardData);
  } catch (error) {
    console.error('Dashboard API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch dashboard data' },
      { status: 500 }
    );
  }
}
