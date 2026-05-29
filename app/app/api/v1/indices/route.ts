import { NextRequest, NextResponse } from 'next/server';
import { verifyApiKey, hasScope } from '@/lib/api-auth';
import { prisma } from '@/lib/db';

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/indices
 * Get price indices
 * Requires API key authentication
 * 
 * Query parameters:
 * - component: Filter by component type (LABOUR, CEMENT, TMT_BARS, etc.)
 * - month: Filter by month (YYYY-MM format)
 * - isProvisional: Filter by provisional status (true/false)
 */
export async function GET(request: NextRequest) {
  try {
    // Verify API key
    const auth = await verifyApiKey(request);

    if (!auth.authenticated) {
      return NextResponse.json(
        { error: auth.error || 'Authentication required' },
        { status: 401 }
      );
    }

    // Check scope
    if (!hasScope(auth, 'indices:read')) {
      return NextResponse.json(
        { error: 'Insufficient permissions. Required scope: indices:read' },
        { status: 403 }
      );
    }

    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const component = searchParams.get('component');
    const month = searchParams.get('month');
    const isProvisional = searchParams.get('isProvisional');

    // Build where clause for PriceIndex
    const where: any = {};

    if (component) {
      where.componentType = component;
    }

    // Fetch price indices with their monthly values
    const indices = await prisma.priceIndex.findMany({
      where,
      include: {
        monthlyValues: {
          where: {
            ...(month ? { month: { equals: new Date(month + '-01') } } : {}),
            ...(isProvisional !== null ? { isProvisional: isProvisional === 'true' } : {})
          },
          orderBy: { month: 'desc' },
          take: 12 // Last 12 months by default
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return NextResponse.json({
      success: true,
      count: indices.length,
      data: indices
    });
  } catch (error) {
    console.error('API v1 indices error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
