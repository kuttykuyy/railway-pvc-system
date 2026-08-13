
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma, withPrismaErrorHandling } from '@/lib/db';
import { getBillingSettings } from '@/lib/admin-settings';

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Find user with billing info
    const user = await withPrismaErrorHandling(() => prisma.user.findUnique({
      where: { email: session.user.email },
      include: {
        customerAccount: true,
      }
    }));

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Get billing settings
    const billingSettings = await getBillingSettings();
    const isAiUploaded = request.nextUrl.searchParams.get('isAiUploaded') === 'true';
    const baseCost = isAiUploaded ? (billingSettings.aiBillCost || 499) : (billingSettings.billCost || 199);
    const isSuperadmin = user.role === 'superadmin';
    const isAdmin = user.role === 'admin';
    const isRailwayOfficial = user.role === 'railway_official';
    const isFree = user.isFreeAccount || isSuperadmin || isAdmin || isRailwayOfficial || user.customProcessingFee === 0;
    
    const billCost = isFree ? 0 : baseCost; // ₹0 cost if user is free/admin/superadmin/official

    // The trial as it actually stands — the same rule /api/user/profile applies. These
    // were hardcoded to zero, so the header told a brand-new user "₹0.00 · Low balance ·
    // Top-up" in red while the bill page below said their first bill was free. The
    // header must not contradict the page it sits above.
    const freeTrialLimit = isFree ? 0 : (billingSettings.freeTrialBills || 1);
    const freeTrialUsed = user.freeTrialUsed || 0;
    const freeTrialRemaining = Math.max(0, freeTrialLimit - freeTrialUsed);
    const isTrialActive = freeTrialRemaining > 0;

    // Get current account balance
    let currentBalance = 0;
    if (user.customerAccount) {
      currentBalance = user.customerAccount.creditBalance || 0;
    }

    // Run independent DB queries in parallel — saves one full round-trip
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const [creditTopupCount, monthlyBillCount] = await Promise.all([
      withPrismaErrorHandling(() => prisma.creditTransaction.count({
        where: { userId: user.id, type: 'add' }
      })),
      withPrismaErrorHandling(() => prisma.bill.count({
        where: {
          contract: { userId: user.id },
          createdAt: { gte: startOfMonth }
        }
      }))
    ]);

    const isPaidUser = creditTopupCount > 0;
    const canAffordNextBill = isFree || currentBalance >= billCost;
    const showLowCreditWarning = !isFree && isPaidUser && currentBalance < (billCost * 2) && currentBalance >= billCost;

    // Determine tools subscription status
    const hasActiveSub = !!(user.pvcToolSubscriptionActive && 
                           user.pvcToolSubscriptionExpiry && 
                           new Date(user.pvcToolSubscriptionExpiry) > new Date());

    // Determine account tier
    let accountTier = 'Low Balance';
    if (isSuperadmin) {
      accountTier = 'Superadmin';
    } else if (isAdmin) {
      accountTier = 'Admin';
    } else if (isRailwayOfficial) {
      accountTier = 'Railway Department';
    } else if (user.isFreeAccount) {
      accountTier = 'Free Tier';
    } else if (user.customProcessingFee === 0) {
      accountTier = 'Unlimited';
    } else {
      if (currentBalance >= billCost * 5) {
        accountTier = 'Premium';
      } else if (currentBalance >= billCost) {
        accountTier = 'Standard';
      } else {
        accountTier = 'Low Balance';
      }
    }

    return NextResponse.json({
      balance: currentBalance,
      nextBillCost: billCost,
      canAffordNextBill,
      showLowCreditWarning,
      paymentProcessingEnabled: !isFree, // No payment processing flow needed if free
      isPaidUser, // Include whether user has ever topped up credits
      trialInfo: {
        isActive: isTrialActive,
        billsUsed: freeTrialUsed,
        billsRemaining: freeTrialRemaining,
        billsTotal: freeTrialLimit, // Include total for frontend display
      },
      subscription: {
        isActive: hasActiveSub,
        expiryDate: user.pvcToolSubscriptionExpiry,
      },
      accountInfo: {
        tier: accountTier,
        monthlyBillCount,
        status: canAffordNextBill ? 'active' : 'insufficient_balance',
      }
    }, {
      headers: {
        // Private (user-specific) — browser may serve stale for 30s while revalidating
        // Halves perceived latency on navigation re-renders without stale balance risk
        'Cache-Control': 'private, max-age=15, stale-while-revalidate=30',
      }
    });

  } catch (error) {
    console.error('Error fetching credit balance:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
