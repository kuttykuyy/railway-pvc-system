
import { NextRequest, NextResponse } from 'next/server';
import { getMaintenanceStatus } from '@/lib/admin-settings';

/**
 * GET /api/admin/maintenance-status
 * Check maintenance mode status for bill creation features
 */
export async function GET(req: NextRequest) {
  try {
    const maintenanceStatus = await getMaintenanceStatus();
    
    return NextResponse.json(maintenanceStatus);
  } catch (error: any) {
    console.error('Error fetching maintenance status:', error);
    return NextResponse.json(
      { error: 'Failed to fetch maintenance status' },
      { status: 500 }
    );
  }
}
