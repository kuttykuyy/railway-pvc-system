import { NextRequest, NextResponse } from 'next/server';
import { validateAdminAccess } from '@/lib/role-auth';
import {
  parseJpcCSV,
  parseManualEntry,
  calculateIndexAverages,
  getSteelIndexComparison,
  importSteelPrices,
  getSteelIndices,
  JPC_STEEL_MAPPINGS
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
    const mappings = Object.entries(JPC_STEEL_MAPPINGS).map(([key, value]) => ({
      key,
      indexName: value.indexName,
      jpcNames: value.jpcNames.slice(0, 5), // First 5 matching names
      description: value.description
    }));

    return NextResponse.json({
      indices,
      mappings,
      csvFormat: 'Product,Delhi,Mumbai,Chennai,Kolkata\nTMT 8MM,54000,55500,56000,55000\n...',
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

    // Parse input data
    let averages: Map<string, number>;
    let parsedEntries: Array<{ product: string; average: number }> = [];

    try {
      if (inputType === 'csv') {
        const entries = parseJpcCSV(data);
        averages = calculateIndexAverages(entries);
        parsedEntries = entries.map(e => ({ 
          product: e.product, 
          average: e.average || 0 
        }));
      } else {
        // Manual entry
        averages = parseManualEntry(data);
        parsedEntries = Array.from(averages.entries()).map(([index, value]) => ({
          product: index,
          average: value
        }));
      }
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
