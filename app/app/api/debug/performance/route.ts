
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    // Admin only. The middleware requires a session, but this returned database
    // topology (largest tables, connection stats) and business volume to any
    // signed-in account.
    const { validateAdminAccess } = await import('@/lib/role-auth');
    const adminCheck = await validateAdminAccess(request);
    if (!adminCheck.authorized) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const report: any = {
      timestamp: new Date().toISOString(),
      status: 'healthy',
      metrics: {
        database: {},
        queries: {},
        pool: {},
        tables: {},
        activity: {},
      },
      score: 100,
      issues: [] as string[],
      recommendations: [] as string[],
    };

    // 1. Database Connection Health
    const dbStart = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    const dbLatency = Date.now() - dbStart;
    report.metrics.database = {
      latency: dbLatency,
      status: dbLatency < 100 ? 'excellent' : dbLatency < 300 ? 'good' : 'slow',
    };

    // 2. Query Performance
    const countStart = Date.now();
    const billCount = await prisma.bill.count();
    const countLatency = Date.now() - countStart;

    const contractStart = Date.now();
    const contractCount = await prisma.contract.count();
    const contractLatency = Date.now() - contractStart;

    const indexStart = Date.now();
    const indexCount = await prisma.monthlyIndexValue.count();
    const indexLatency = Date.now() - indexStart;

    report.metrics.queries = {
      billCount: { records: billCount, latency: countLatency },
      contractCount: { records: contractCount, latency: contractLatency },
      indexCount: { records: indexCount, latency: indexLatency },
      complexQuery: { latency: 0, recordsFetched: 0 }, // Initialize
    };

    // 3. Complex Query Performance
    const complexStart = Date.now();
    const recentBills = await prisma.bill.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      include: {
        contract: {
          select: {
            id: true,
            workDescription: true,
            agreementNo: true,
          }
        },
      },
    });
    const complexLatency = Date.now() - complexStart;
    report.metrics.queries.complexQuery = {
      latency: complexLatency,
      recordsFetched: recentBills.length,
    };

    // 4. Database Pool Status
    const poolStatus: any = await prisma.$queryRaw`
      SELECT 
        count(*) as total_connections,
        count(*) FILTER (WHERE state = 'active') as active_connections,
        count(*) FILTER (WHERE state = 'idle') as idle_connections
      FROM pg_stat_activity 
      WHERE datname = current_database()
    `;
    const poolMetrics = {
      total: Number(poolStatus[0]?.total_connections || 0),
      active: Number(poolStatus[0]?.active_connections || 0),
      idle: Number(poolStatus[0]?.idle_connections || 0),
    };
    report.metrics.pool = poolMetrics;

    // 5. Table Sizes
    const tableSizes: any = await prisma.$queryRaw`
      SELECT 
        tablename,
        pg_size_pretty(pg_total_relation_size('public.'||tablename)) as size,
        pg_total_relation_size('public.'||tablename) as bytes
      FROM pg_tables 
      WHERE schemaname = 'public'
      ORDER BY pg_total_relation_size('public.'||tablename) DESC
      LIMIT 5
    `;
    report.metrics.tables = tableSizes.map((t: any) => ({
      name: t.tablename,
      size: t.size,
    }));

    // 6. Recent Activity
    const recentActivity: any = await prisma.$queryRaw`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as bills_created
      FROM bills
      WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
      GROUP BY DATE(created_at)
      ORDER BY date DESC
      LIMIT 7
    `;
    report.metrics.activity = recentActivity.map((a: any) => ({
      date: a.date.toISOString().split('T')[0],
      billsCreated: Number(a.bills_created),
    }));

    // 7. Performance Scoring
    if (dbLatency > 300) {
      report.score -= 20;
      report.issues.push('Database latency too high');
      report.recommendations.push('Check database server health and network latency');
    }
    if (complexLatency > 500) {
      report.score -= 15;
      report.issues.push('Complex queries too slow');
      report.recommendations.push('Consider adding more database indexes');
    }
    if (poolMetrics.active > 10) {
      report.score -= 10;
      report.issues.push('High active connections');
      report.recommendations.push('Monitor connection pool usage and implement connection pooling');
    }

    // Generate recommendations based on score
    if (report.score >= 90) {
      report.recommendations.push('Performance is excellent. No immediate action needed.');
    } else if (report.score >= 70) {
      report.recommendations.push('Performance is good but could be improved.');
      if (complexLatency > 300) {
        report.recommendations.push('Consider optimizing complex queries');
      }
    } else {
      report.recommendations.push('Performance issues detected - immediate action recommended');
    }

    report.status = report.score >= 70 ? 'healthy' : report.score >= 50 ? 'degraded' : 'critical';

    return NextResponse.json(report, { status: 200 });
  } catch (error: any) {
    return NextResponse.json(
      {
        status: 'error',
        error: error.message,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
