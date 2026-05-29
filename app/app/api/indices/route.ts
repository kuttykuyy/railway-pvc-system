
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { validateAdminAccess } from '@/lib/role-auth';

export const dynamic = "force-dynamic";

// GET /api/indices - Get all price indices with latest monthly values
export async function GET() {
  try {
    const indices = await prisma.priceIndex.findMany({
      orderBy: { name: 'asc' },
      include: {
        monthlyValues: {
          orderBy: { month: 'desc' },
          take: 12 // Last 12 months
        }
      }
    });
    
    return NextResponse.json(indices);
  } catch (error) {
    console.error('Error fetching price indices:', error);
    return NextResponse.json(
      { error: 'Failed to fetch price indices' },
      { status: 500 }
    );
  }
}

// POST /api/indices - Initialize base price indices (Admin only)
export async function POST(request: NextRequest) {
  try {
    // Check admin access
    const { authorized, message } = await validateAdminAccess(request);
    
    if (!authorized) {
      return NextResponse.json(
        { error: message || 'Admin access required' },
        { status: 403 }
      );
    }
    const baseIndices = [
      { name: 'Labour', baseValue: 129.90, description: 'Labour price index' },
      { name: 'RBI Plant Machinery', baseValue: 83.90, description: 'RBI Plant Machinery & Spares index' },
      { name: 'MPNG Fuel', baseValue: 93.06, description: 'MPNG Fuel & Lubricants index' },
      { name: 'RBI Other Materials', baseValue: 154.00, description: 'RBI Other Materials index' },
      { name: 'RBI Cement', baseValue: 137.40, description: 'RBI Cement index' },
      { name: 'RBI Explosives', baseValue: 190.10, description: 'RBI Explosives index' },
      { name: 'Steel TMT Bars', baseValue: 70150.00, description: 'Steel TMT Bars index' },
      { name: 'Steel Angle/Channel', baseValue: 69740.00, description: 'Steel Angle/Channel index' },
      { name: 'Steel Plates', baseValue: 75540.00, description: 'Steel Plates index' },
      { name: 'Steel Other Sections', baseValue: 71810.00, description: 'Steel Other Sections index' }
    ];

    const results = [];
    for (const index of baseIndices) {
      const result = await prisma.priceIndex.upsert({
        where: { name: index.name },
        update: {},
        create: index
      });
      results.push(result);
    }
    
    return NextResponse.json(results);
  } catch (error) {
    console.error('Error initializing indices:', error);
    return NextResponse.json(
      { error: 'Failed to initialize price indices' },
      { status: 500 }
    );
  }
}
