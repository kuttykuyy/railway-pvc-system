import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { validateAdminAccess } from '@/lib/role-auth';

export const dynamic = 'force-dynamic';

// GET /api/admin/credit-statements?type=all|add|deduct&page=1&limit=50
export async function GET(request: NextRequest) {
  const { authorized, message } = await validateAdminAccess(request);
  if (!authorized) return NextResponse.json({ error: message || 'Admin access required' }, { status: 403 });

  const params = request.nextUrl.searchParams;
  const type = params.get('type') || 'all';
  const page = parseInt(params.get('page') || '1');
  const limit = parseInt(params.get('limit') || '50');
  const skip = (page - 1) * limit;

  const where: any = {};
  if (type === 'add') where.type = 'add';
  if (type === 'deduct') where.type = 'deduct';

  const [transactions, total, summary] = await Promise.all([
    prisma.creditTransaction.findMany({
      where,
      include: {
        user: { select: { name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.creditTransaction.count({ where }),
    prisma.creditTransaction.groupBy({
      by: ['type'],
      _sum: { amount: true },
      _count: true,
    }),
  ]);

  const totalTopups = summary.find(s => s.type === 'add');
  const totalUsage = summary.find(s => s.type === 'deduct');

  return NextResponse.json({
    transactions: transactions.map(t => ({
      id: t.id,
      userName: t.user.name,
      userEmail: t.user.email,
      amount: t.amount,
      type: t.type,
      reason: t.reason,
      balanceBefore: t.balanceBefore,
      balanceAfter: t.balanceAfter,
      createdAt: t.createdAt,
      adminUserEmail: t.adminUserEmail,
    })),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    summary: {
      totalTopups: totalTopups?._sum.amount || 0,
      topupCount: totalTopups?._count || 0,
      totalUsage: Math.abs(totalUsage?._sum.amount || 0),
      usageCount: totalUsage?._count || 0,
    },
  });
}
