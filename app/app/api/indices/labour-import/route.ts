/**
 * API endpoint for importing Labour Index (CPI-IW) data
 * POST: Import Labour index data from CSV
 * 
 * Usage:
 * 1. Download CSV from https://labourbureau.gov.in/all-india-index
 * 2. Upload the CSV content to this endpoint
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { parseLabourCSV, updateLabourIndexFromData, getLabourIndexComparison } from '@/lib/labour-fetcher';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // Check if user is admin
    if ((session.user as any).role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }
    
    const body = await request.json();
    const { csvContent, action, isProvisional = false, onlyMissing = false } = body;
    
    if (!csvContent) {
      return NextResponse.json({ error: 'CSV content is required' }, { status: 400 });
    }
    
    // Parse the CSV
    const parsedData = parseLabourCSV(csvContent);
    
    if (parsedData.length === 0) {
      return NextResponse.json({ error: 'No valid data found in CSV' }, { status: 400 });
    }
    
    // Preview mode - show comparison with current data
    if (action === 'preview') {
      const comparison = await getLabourIndexComparison(parsedData);
      
      return NextResponse.json({
        success: true,
        source: 'Labour Bureau CPI-IW',
        baseYear: 2016,
        totalEntries: parsedData.length,
        comparison
      });
    }
    
    // Import mode - update database
    if (action === 'import') {
      const result = await updateLabourIndexFromData(parsedData, {
        isProvisional,
        onlyMissing
      });
      
      return NextResponse.json({
        success: true,
        message: `Labour index updated successfully`,
        result
      });
    }
    
    return NextResponse.json({ error: 'Invalid action. Use "preview" or "import"' }, { status: 400 });
    
  } catch (error) {
    console.error('Labour index import error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to import Labour index' },
      { status: 500 }
    );
  }
}
