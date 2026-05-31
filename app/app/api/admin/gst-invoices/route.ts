import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

// Mark route as dynamic
export const dynamic = 'force-dynamic';
export const revalidate = 0;

// GET /api/admin/gst-invoices - Get all GST invoices (admin only)
export async function GET(request: NextRequest) {
  logger.log('[Admin GST Invoices] API route called');
  try {
    const session = await getServerSession(authOptions);
    logger.log('[Admin GST Invoices] Session:', session ? 'exists' : 'missing');
    
    if (!session?.user?.email) {
      logger.log('[Admin GST Invoices] No session or email found');
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    logger.log('[Admin GST Invoices] User email:', session.user.email);

    // Get user and check if admin
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    logger.log('[Admin GST Invoices] User found:', user ? `${user.email} (${user.role})` : 'not found');

    if (!user || user.role !== 'admin') {
      logger.log('[Admin GST Invoices] User not admin or not found');
      return NextResponse.json(
        { error: 'Unauthorized. Admin access required.' },
        { status: 403 }
      );
    }

    // Get all GST invoices with user information
    logger.log('[Admin GST Invoices] Fetching GST invoices...');
    const invoices = await prisma.gstInvoice.findMany({
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    logger.log(`[Admin GST Invoices] Found ${invoices.length} invoices`);
    return NextResponse.json({ invoices });
  } catch (error: any) {
    console.error('[Admin GST Invoices] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch GST invoices' },
      { status: 500 }
    );
  }
}

