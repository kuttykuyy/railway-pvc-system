
import { NextRequest, NextResponse } from 'next/server';
import { PRICING_TIERS, BASE_PRICE_PER_BILL, FREE_TRIAL_BILLS, calculateBillPricing } from '@/lib/billing';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/db';

export const dynamic = "force-dynamic";

// GET /api/billing/pricing - Get pricing information
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession();
    let nextBillPricing = null;

    // If user is logged in, calculate their next bill pricing
    if (session?.user?.email) {
      const user = await prisma.user.findUnique({
        where: { email: session.user.email }
      });

      if (user) {
        try {
          nextBillPricing = await calculateBillPricing(user.id);
        } catch (error) {
          console.error('Error calculating pricing:', error);
        }
      }
    }

    return NextResponse.json({
      basePricePerBill: BASE_PRICE_PER_BILL,
      freeTrialBills: FREE_TRIAL_BILLS,
      pricingTiers: PRICING_TIERS,
      nextBillPricing,
      features: {
        standard: [
          'PVC calculation per bill',
          'Basic reporting',
          'Email support',
          'GCC-2022 compliance'
        ],
        volume: [
          'All standard features',
          'Volume discounts',
          'Priority support',
          'Advanced analytics'
        ],
        enterprise: [
          'All volume features',
          'Custom integrations',
          'Dedicated support',
          'White-label options'
        ]
      }
    });
  } catch (error) {
    console.error('Error fetching pricing:', error);
    return NextResponse.json(
      { error: 'Failed to fetch pricing' },
      { status: 500 }
    );
  }
}
