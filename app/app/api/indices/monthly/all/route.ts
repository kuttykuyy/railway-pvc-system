
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = "force-dynamic";

// GET /api/indices/monthly/all - Get all monthly index values
export async function GET(request: NextRequest) {
  try {
    // Only the fields the manage screen reads. `include: { priceIndex: true }` repeated
    // the whole index record — id, base value, description, timestamps — on every one of
    // the ~2,000 rows this returns, for a screen that uses nothing from it but the name.
    const monthlyValues = await prisma.monthlyIndexValue.findMany({
      select: {
        id: true,
        priceIndexId: true,
        month: true,
        value: true,
        isProvisional: true,
        source: true,
        updatedAt: true,
        priceIndex: { select: { name: true } },
      },
      orderBy: [
        { month: 'desc' },
        { priceIndex: { name: 'asc' } }
      ]
    });
    
    return NextResponse.json(monthlyValues);
  } catch (error) {
    console.error('Error fetching all monthly values:', error);
    return NextResponse.json(
      { error: 'Failed to fetch monthly values' },
      { status: 500 }
    );
  }
}
