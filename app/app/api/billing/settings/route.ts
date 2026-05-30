
import { NextResponse } from 'next/server';
import { getBillingSettings } from '@/lib/admin-settings';
import { validateApiAccess } from '@/lib/payment-validation';

export const dynamic = 'force-dynamic';

/**
 * GET /api/billing/settings
 * Get current billing settings including cost per bill and free trial info
 */
export async function GET(request: Request) {
  try {
    // Validate user is authenticated
    const { authorized, user, message } = await validateApiAccess(request);
    
    if (!authorized || !user) {
      return NextResponse.json(
        { error: message || 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get billing settings
    const settings = await getBillingSettings();
    
    // Calculate user's free trial status
    const freeTrialUsed = user.freeTrialUsed || 0;
    const freeTrialLimit = settings.freeTrialBills || 1;
    const freeTrialRemaining = Math.max(0, freeTrialLimit - freeTrialUsed);
    const isTrialActive = user.isTrialActive && freeTrialRemaining > 0;

    return NextResponse.json({
      billCost: settings.billCost,
      freeTrialBills: settings.freeTrialBills,
      freeTrialUsed,
      freeTrialRemaining,
      isTrialActive,
      isFreeAccount: user.isFreeAccount || user.role === 'superadmin' || user.role === 'railway_official',
      customProcessingFee: user.customProcessingFee,
    });
  } catch (error) {
    console.error('Error fetching billing settings:', error);
    return NextResponse.json(
      { error: 'Failed to fetch billing settings' },
      { status: 500 }
    );
  }
}
