
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
    const isSuperadmin = user.role === 'superadmin';
    const isAdmin = user.role === 'admin';
    const isRailwayOfficial = user.role === 'railway_official';
    const isFree = user.isFreeAccount || isSuperadmin || isAdmin || isRailwayOfficial || user.customProcessingFee === 0;
    
    const billCost = isFree ? 0 : (billingSettings.billCost || 10); // ₹0 cost if user is free/admin/superadmin/official
    const freeTrialLimit = billingSettings.freeTrialBills || 1; // Get from admin settings
    
    // Calculate free trial info
    const freeTrialUsed = user.freeTrialUsed || 0;
    const freeTrialRemaining = Math.max(0, freeTrialLimit - freeTrialUsed);
    const isTrialActive = user.isTrialActive && freeTrialRemaining > 0 && !isFree;

    // Get current account balance
    let currentBalance = 0;
    if (user.customerAccount) {
      currentBalance = user.customerAccount.creditBalance || 0;
    }

    // Check if user has ever topped up credits (i.e., is a paid user)
    const creditTopupCount = await withPrismaErrorHandling(() => prisma.creditTransaction.count({
      where: {
        userId: user.id,
        type: 'add'
      }
    }));
    const isPaidUser = creditTopupCount > 0;
    
    // Calculate if user can afford next bill
    // Free accounts/superadmins can always afford next bill
    const canAffordNextBill = isFree || !isPaidUser || isTrialActive || currentBalance >= billCost;
    // Only show warning for users who have actually paid/topped up their account and are not free
    const showLowCreditWarning = !isFree && !isTrialActive && isPaidUser && currentBalance < (billCost * 2) && currentBalance >= billCost;

    // Get monthly bill count
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    
    const monthlyBillCount = await withPrismaErrorHandling(() => prisma.bill.count({
      where: {
        contract: {
          userId: user.id
        },
        createdAt: {
          gte: startOfMonth
        }
      }
    }));

    // Determine account tier
    let accountTier = 'Free Trial';
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
    } else if (!isTrialActive) {
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
      accountInfo: {
        tier: accountTier,
        monthlyBillCount,
        status: canAffordNextBill ? 'active' : 'insufficient_balance',
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
