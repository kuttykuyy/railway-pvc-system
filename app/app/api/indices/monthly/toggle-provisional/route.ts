import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { validateAdminAccess } from '@/lib/role-auth';

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/indices/monthly/toggle-provisional
 * Toggle provisional status for all values of a specific index in a given year
 * Body: { priceIndexId: string, year: number, isProvisional: boolean }
 * OR: { priceIndexName: string, year: number, isProvisional: boolean }
 */
export async function PATCH(request: NextRequest) {
  try {
    const { authorized, message } = await validateAdminAccess(request);
    if (!authorized) {
      return NextResponse.json({ error: message || 'Admin access required' }, { status: 403 });
    }

    const body = await request.json();
    const { priceIndexId, priceIndexName, year, isProvisional } = body;

    if (!year || typeof isProvisional !== 'boolean') {
      return NextResponse.json({ error: 'year and isProvisional are required' }, { status: 400 });
    }

    // Resolve the price index ID
    let indexId = priceIndexId;
    if (!indexId && priceIndexName) {
      const idx = await prisma.priceIndex.findFirst({ where: { name: priceIndexName } });
      if (!idx) {
        return NextResponse.json({ error: `Index not found: ${priceIndexName}` }, { status: 404 });
      }
      indexId = idx.id;
    }

    if (!indexId) {
      return NextResponse.json({ error: 'priceIndexId or priceIndexName required' }, { status: 400 });
    }

    const startDate = new Date(Date.UTC(year, 0, 1));
    const endDate = new Date(Date.UTC(year, 11, 31, 23, 59, 59));

    const result = await prisma.monthlyIndexValue.updateMany({
      where: {
        priceIndexId: indexId,
        month: { gte: startDate, lte: endDate },
      },
      data: {
        isProvisional,
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      updated: result.count,
      isProvisional,
      year,
    });
  } catch (error) {
    console.error('[Toggle Provisional] Error:', error);
    return NextResponse.json({ error: 'Failed to toggle provisional status' }, { status: 500 });
  }
}
