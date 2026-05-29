
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = "force-dynamic";

// POST /api/indices/monthly - Add monthly index value(s)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Handle both single entry and bulk import
    if (body.monthlyData && Array.isArray(body.monthlyData)) {
      // Bulk import from manual-import page
      const { monthlyData } = body;
      const results = [];
      
      for (const item of monthlyData) {
        const { priceIndexId, month, value, isProvisional = false } = item;
        
        const monthDate = new Date(month);
        monthDate.setDate(1);
        monthDate.setHours(0, 0, 0, 0);
        
        const monthlyValue = await prisma.monthlyIndexValue.upsert({
          where: {
            priceIndexId_month: {
              priceIndexId,
              month: monthDate
            }
          },
          update: { 
            value: parseFloat(value),
            isProvisional: Boolean(isProvisional)
          },
          create: {
            priceIndexId,
            month: monthDate,
            value: parseFloat(value),
            isProvisional: Boolean(isProvisional)
          }
        });
        
        results.push(monthlyValue);
      }
      
      return NextResponse.json({ 
        success: true, 
        count: results.length,
        data: results 
      });
    } else {
      // Single entry
      const { priceIndexId, month, value, isProvisional = false } = body;
      
      if (!priceIndexId || !month || value === undefined) {
        return NextResponse.json(
          { error: 'Missing required fields' },
          { status: 400 }
        );
      }

      const monthDate = new Date(month);
      monthDate.setDate(1); // Set to first day of month
      monthDate.setHours(0, 0, 0, 0);
      
      const monthlyValue = await prisma.monthlyIndexValue.upsert({
        where: {
          priceIndexId_month: {
            priceIndexId,
            month: monthDate
          }
        },
        update: { 
          value: parseFloat(value),
          isProvisional: Boolean(isProvisional)
        },
        create: {
          priceIndexId,
          month: monthDate,
          value: parseFloat(value),
          isProvisional: Boolean(isProvisional)
        }
      });
      
      return NextResponse.json(monthlyValue);
    }
  } catch (error) {
    console.error('Error adding monthly index value:', error);
    return NextResponse.json(
      { error: 'Failed to add monthly index value' },
      { status: 500 }
    );
  }
}

// PUT /api/indices/monthly - Update multiple monthly values
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { values } = body; // Array of { priceIndexId, month, value }
    
    if (!Array.isArray(values)) {
      return NextResponse.json(
        { error: 'Values must be an array' },
        { status: 400 }
      );
    }

    const results = [];
    for (const item of values) {
      const { priceIndexId, month, value, isProvisional = false } = item;
      
      const monthDate = new Date(month);
      monthDate.setDate(1);
      monthDate.setHours(0, 0, 0, 0);
      
      const monthlyValue = await prisma.monthlyIndexValue.upsert({
        where: {
          priceIndexId_month: {
            priceIndexId,
            month: monthDate
          }
        },
        update: { 
          value: parseFloat(value),
          isProvisional: Boolean(isProvisional)
        },
        create: {
          priceIndexId,
          month: monthDate,
          value: parseFloat(value),
          isProvisional: Boolean(isProvisional)
        }
      });
      
      results.push(monthlyValue);
    }
    
    return NextResponse.json(results);
  } catch (error) {
    console.error('Error updating monthly values:', error);
    return NextResponse.json(
      { error: 'Failed to update monthly values' },
      { status: 500 }
    );
  }
}
