
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = "force-dynamic";

// GET /api/indices/monthly/all - Get all monthly index values
export async function GET(request: NextRequest) {
  try {
    const monthlyValues = await prisma.monthlyIndexValue.findMany({
      include: {
        priceIndex: true
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
