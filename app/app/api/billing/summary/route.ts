
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = "force-dynamic";

// Billing summary API - REMOVED
// All bill processing is now free, no billing summary needed

export async function GET(request: NextRequest) {
  return NextResponse.json({
    user: {
      totalBillsProcessed: 0,
      freeTrialUsed: 0,
      freeTrialRemaining: 999,
      isTrialActive: false,
    },
    account: {
      status: 'active',
      outstandingAmount: 0,
      creditBalance: 999999,
    },
    monthly: {
      totalBills: 0,
      paidBills: 0,
      pendingBills: 0,
      freeBills: 0,
      totalAmount: 0,
      totalSavings: 0,
    },
    nextBillPricing: {
      originalPrice: 0,
      finalPrice: 0,
      discount: 0,
      discountType: null,
      isFree: true,
      tier: {
        name: 'free',
        displayName: 'Free',
        discountPercent: 100,
      },
    },
    currentTier: {
      name: 'free',
      displayName: 'Free',
      discountPercent: 100,
    },
    message: 'All bill processing is now free!'
  });
}
