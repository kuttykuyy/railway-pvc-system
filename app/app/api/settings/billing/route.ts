
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { getBillingSettings } from '@/lib/admin-settings';

export const dynamic = "force-dynamic";

/**
 * GET /api/settings/billing
 * Returns billing configuration for the system
 * Used to check minimum bill cost and payment status
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Fetch billing settings from admin settings
    const settings = await getBillingSettings();

    // Billing settings rarely change — cache publicly for 5 min, serve stale for 10 min
    // Dramatically reduces DB load from the 60s navigation polling
    return NextResponse.json({
      billCost: settings.billCost,
      paymentEnabled: settings.paymentEnabled,
      freeTrialBills: settings.freeTrialBills,
    }, {
      headers: {
        'Cache-Control': 'private, max-age=300, stale-while-revalidate=600',
      }
    });
  } catch (error) {
    console.error('Error fetching billing settings:', error);
    return NextResponse.json(
      { error: 'Failed to fetch billing settings' },
      { status: 500 }
    );
  }
}
