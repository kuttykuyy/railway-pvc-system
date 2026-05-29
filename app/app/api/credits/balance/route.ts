
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
    const billCost = billingSettings.billCost || 10; // Default matches BILL_PROCESSING_COST in admin settings
    const freeTrialLimit = billingSettings.freeTrialBills || 1; // Get from admin settings
    
    // Calculate free trial info
    const freeTrialUsed = user.freeTrialUsed || 0;
    const freeTrialRemaining = Math.max(0, freeTrialLimit - freeTrialUsed);
    const isTrialActive = user.isTrialActive && freeTrialRemaining > 0;

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
    // Free accounts (who have never topped up) can always create bills
    const canAffordNextBill = !isPaidUser || isTrialActive || currentBalance >= billCost;
    // Only show warning for users who have actually paid/topped up their account
    const showLowCreditWarning = !isTrialActive && isPaidUser && currentBalance < (billCost * 2) && currentBalance >= billCost;

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
    if (!user.isTrialActive) {
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
      paymentProcessingEnabled: true, // Payment processing is available (not Razorpay specifically)
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
