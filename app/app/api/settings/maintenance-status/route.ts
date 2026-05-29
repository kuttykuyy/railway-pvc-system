
import { NextRequest, NextResponse } from 'next/server';
import { getMaintenanceStatus } from '@/lib/admin-settings';

export const dynamic = "force-dynamic";

/**
 * GET /api/settings/maintenance-status
 * Public endpoint to check maintenance mode status
 */
export async function GET(request: NextRequest) {
  try {
    const maintenanceStatus = await getMaintenanceStatus();

    return NextResponse.json({
      success: true,
      maintenanceStatus
    });
  } catch (error) {
    console.error('Error fetching maintenance status:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to fetch maintenance status',
        maintenanceStatus: {
          singleBillMaintenance: false,
          bulkBillingMaintenance: false
        }
      },
      { status: 500 }
    );
  }
}
