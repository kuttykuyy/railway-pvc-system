
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = "force-dynamic";

// GET /api/indices/check-provisional?date=YYYY-MM-DD
// Check if a given date has provisional indices data
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get('date');
    
    if (!dateParam) {
      return NextResponse.json(
        { error: 'Date parameter is required' },
        { status: 400 }
      );
    }

    // Validate date format (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(dateParam)) {
      return NextResponse.json(
        { error: 'Invalid date format. Expected YYYY-MM-DD' },
        { status: 400 }
      );
    }

    // Parse the input date and validate it's a valid date
    const inputDate = new Date(dateParam);
    if (isNaN(inputDate.getTime())) {
      return NextResponse.json(
        { error: 'Invalid date value' },
        { status: 400 }
      );
    }

    // Validate year is reasonable (between 1900 and 2100)
    const year = inputDate.getFullYear();
    if (year < 1900 || year > 2100) {
      return NextResponse.json(
        { error: 'Invalid date: year must be between 1900 and 2100' },
        { status: 400 }
      );
    }

    // Get the first day of that month
    const monthDate = new Date(year, inputDate.getMonth(), 1);
    monthDate.setHours(0, 0, 0, 0);

    // Get all monthly index values for this month
    const monthlyValues = await prisma.monthlyIndexValue.findMany({
      where: {
        month: monthDate
      },
      include: {
        priceIndex: {
          select: {
            name: true
          }
        }
      }
    });

    // Get all available price indices
    const allIndices = await prisma.priceIndex.findMany({
      select: {
        name: true
      }
    });

    const allIndexNames = allIndices.map(idx => idx.name);
    const provisionalIndices: string[] = [];
    const finalIndices: string[] = [];
    const existingIndexNames = new Set<string>();

    monthlyValues.forEach(value => {
      existingIndexNames.add(value.priceIndex.name);
      if (value.isProvisional) {
        provisionalIndices.push(value.priceIndex.name);
      } else {
        finalIndices.push(value.priceIndex.name);
      }
    });

    const missingIndices = allIndexNames.filter(name => !existingIndexNames.has(name));
    const hasProvisionalData = provisionalIndices.length > 0;

    return NextResponse.json({
      month: monthDate.toISOString().substring(0, 7), // YYYY-MM format
      provisionalIndices: provisionalIndices.sort(),
      finalIndices: finalIndices.sort(),
      missingIndices: missingIndices.sort(),
      hasProvisionalData,
      totalIndices: allIndexNames.length,
      presentIndices: monthlyValues.length
    });

  } catch (error) {
    console.error('Error checking provisional indices:', error);
    return NextResponse.json(
      { error: 'Failed to check provisional indices' },
      { status: 500 }
    );
  }
}
