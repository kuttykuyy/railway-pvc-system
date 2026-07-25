import { NextRequest, NextResponse } from 'next/server';
import { validateAdminAccess } from '@/lib/role-auth';
import {
  parseManualEntry,
  getSteelIndexComparison,
  importSteelPrices,
  getSteelIndices,
} from '@/lib/jpc-fetcher';

/**
 * GET: Get current steel indices data and JPC mappings info
 */
export async function GET(request: NextRequest) {
  try {
    const adminCheck = await validateAdminAccess(request);
    if (!adminCheck.authorized) {
      return NextResponse.json(
        { error: adminCheck.message || 'Unauthorized' },
        { status: 403 }
      );
    }

    const indices = await getSteelIndices();

    return NextResponse.json({
      indices,
      manualFormat: 'TMT: 72000\nAngle/Channel: 71000\nPlates: 75000\nOther Sections: 72500'
    });
  } catch (error) {
    console.error('Error fetching steel indices:', error);
    return NextResponse.json(
      { error: 'Failed to fetch steel indices' },
      { status: 500 }
    );
  }
}

/**
 * POST: Import or preview steel prices
 * Body:
 * - action: 'preview' | 'import'
 * - month: string (YYYY-MM format)
 * - inputType: 'csv' | 'manual'
 * - data: string (CSV content or manual entry text)
 * - isProvisional: boolean (for import action)
 */
export async function POST(request: NextRequest) {
  try {
    const adminCheck = await validateAdminAccess(request);
    if (!adminCheck.authorized) {
      return NextResponse.json(
        { error: adminCheck.message || 'Unauthorized' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { action, month, inputType, data, isProvisional = true } = body;

    if (!month) {
      return NextResponse.json({ error: 'Month is required' }, { status: 400 });
    }

    if (!data) {
      return NextResponse.json({ error: 'Data is required' }, { status: 400 });
    }

    // Parse month
    const monthDate = new Date(`${month}-01T00:00:00.000Z`);
    if (isNaN(monthDate.getTime())) {
      return NextResponse.json({ error: 'Invalid month format. Use YYYY-MM' }, { status: 400 });
    }

    // CSV import is deliberately not supported: it derived each index from a product
    // basket that did NOT match GCC-2022 Clause 46A.9(1) (it averaged TMT 8/12/16mm,
    // Angle 50x50x6, Plate 6/8mm). The entry screens send already-averaged values
    // built from the correct GCC items, so only that form is accepted here.
    if (inputType === 'csv') {
      return NextResponse.json(
        { error: 'CSV import has been removed. Use the F1/F2 fortnight entry screen, which follows GCC-2022 Clause 46A.9(1).' },
        { status: 400 },
      );
    }

    // Parse input data — already-averaged index values, one per line.
    let averages: Map<string, number>;
    let parsedEntries: Array<{ product: string; average: number }> = [];

    try {
      averages = parseManualEntry(data);
      parsedEntries = Array.from(averages.entries()).map(([index, value]) => ({
        product: index,
        average: value
      }));
    } catch (parseError) {
      return NextResponse.json(
        { error: `Failed to parse data: ${parseError instanceof Error ? parseError.message : 'Unknown error'}` },
        { status: 400 }
      );
    }

    if (averages.size === 0) {
      return NextResponse.json(
        { error: 'No valid steel data found in the input' },
        { status: 400 }
      );
    }

    if (action === 'preview') {
      // Preview mode - show comparison without importing
      const comparison = await getSteelIndexComparison(monthDate, averages);
      
      return NextResponse.json({
        success: true,
        month,
        parsedEntries,
        comparison,
        summary: {
          total: comparison.length,
          new: comparison.filter(c => c.status === 'new').length,
          updated: comparison.filter(c => c.status === 'updated').length,
          unchanged: comparison.filter(c => c.status === 'unchanged').length
        }
      });
    } else if (action === 'import') {
      // Import mode - actually save to database
      const results = await importSteelPrices(monthDate, averages, isProvisional);
      
      return NextResponse.json({
        success: true,
        month,
        results,
        summary: {
          total: results.length,
          new: results.filter(r => r.status === 'new').length,
          updated: results.filter(r => r.status === 'updated').length,
          unchanged: results.filter(r => r.status === 'unchanged').length
        }
      });
    } else {
      return NextResponse.json(
        { error: 'Invalid action. Use "preview" or "import"' },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error('Error in steel import:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
