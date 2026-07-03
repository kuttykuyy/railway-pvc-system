import { NextResponse } from 'next/server';
import { getBillingSettings } from '@/lib/admin-settings';

export const dynamic = 'force-dynamic';

/**
 * GET /api/public/pricing
 * Public (no auth) live pricing so marketing pages show the real, admin-set rates:
 * the manual-entry bill rate and the higher AI PDF auto-extraction rate.
 */
export async function GET() {
  try {
    const settings = await getBillingSettings();
    return NextResponse.json({
      billCost: settings.billCost,        // manual entry
      aiBillCost: settings.aiBillCost,    // AI PDF auto-extraction
      freeTrialBills: settings.freeTrialBills,
    });
  } catch (error) {
    console.error('Error fetching public pricing:', error);
    // Safe defaults matching the admin-setting defaults.
    return NextResponse.json({ billCost: 199, aiBillCost: 499, freeTrialBills: 1 });
  }
}
