
/**
 * API endpoint to fetch WhatsApp logs
 * Admin-only access
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { role: true },
    });

    if (user?.role !== 'admin') {
      return NextResponse.json({ error: 'Access denied. Admin only.' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const status = searchParams.get('status');
    const phoneNumber = searchParams.get('phoneNumber');
    const billNumber = searchParams.get('billNumber');
    const template = searchParams.get('template');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    const skip = (page - 1) * limit;

    // Build where clause
    const where: any = {};

    if (status && status !== 'all') {
      where.status = status;
    }

    if (phoneNumber) {
      where.phoneNumber = {
        contains: phoneNumber,
      };
    }

    if (template && template !== 'all') {
      where.template = template;
    }

    if (billNumber) {
      where.bill = {
        billNo: {
          contains: billNumber,
          mode: 'insensitive',
        },
      };
    }

    if (startDate) {
      where.sentAt = {
        ...where.sentAt,
        gte: new Date(startDate),
      };
    }

    if (endDate) {
      where.sentAt = {
        ...where.sentAt,
        lte: new Date(endDate),
      };
    }

    // Fetch logs with pagination
    const [logs, total] = await Promise.all([
      prisma.whatsAppLog.findMany({
        where,
        include: {
          bill: {
            select: {
              billNo: true,
              contract: {
                select: {
                  agreementNo: true,
                  contractorName: true,
                },
              },
            },
          },
          user: {
            select: {
              name: true,
              email: true,
            },
          },
        },
        orderBy: {
          sentAt: 'desc',
        },
        skip,
        take: limit,
      }),
      prisma.whatsAppLog.count({ where }),
    ]);

    // Get statistics
    const stats = await prisma.whatsAppLog.groupBy({
      by: ['status'],
      _count: {
        _all: true,
      },
    });

    const statusCounts = {
      all: total,
      sent: 0,
      failed: 0,
      pending: 0,
      delivered: 0,
      read: 0,
    };

    stats.forEach((stat: any) => {
      if (stat.status in statusCounts) {
        (statusCounts as any)[stat.status] = stat._count._all;
      }
    });

    return NextResponse.json({
      logs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      stats: statusCounts,
    });
  } catch (error: any) {
    console.error('Fetch WhatsApp logs error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch WhatsApp logs' },
      { status: 500 }
    );
  }
}
