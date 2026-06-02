import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { validateApiAccess } from '@/lib/payment-validation';

export const dynamic = 'force-dynamic';

const SUBSCRIPTION_COST = 99;

/**
 * POST /api/billing/subscribe-tools
 * Activates the Advanced Features Monthly Subscription (₹99/month) by deducting credits.
 */
export async function POST(request: Request) {
  try {
    // Validate user is authenticated
    const { authorized, user, message } = await validateApiAccess(request);
    
    if (!authorized || !user) {
      return NextResponse.json(
        { error: message || 'Unauthorized' },
        { status: 401 }
      );
    }

    const userId = user.id;

    // Check current balance
    const customerAccount = await prisma.customerAccount.findUnique({
      where: { userId }
    });

    const currentBalance = customerAccount?.creditBalance || 0;

    if (currentBalance < SUBSCRIPTION_COST) {
      return NextResponse.json(
        { error: `Insufficient credits. Subscription requires ₹${SUBSCRIPTION_COST}, but your balance is ₹${currentBalance}. Please top up your balance.` },
        { status: 400 }
      );
    }

    const expiryDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days from now

    // Deduct ₹99 and update subscription details atomically
    await prisma.$transaction([
      // 1. Deduct balance from CustomerAccount
      prisma.customerAccount.update({
        where: { userId },
        data: { creditBalance: { decrement: SUBSCRIPTION_COST } }
      }),
      // 2. Log credit deduction transaction
      prisma.creditTransaction.create({
        data: {
          userId,
          amount: SUBSCRIPTION_COST,
          type: 'deduct',
          reason: `Advanced Features Subscription (₹${SUBSCRIPTION_COST}/month)`,
          balanceBefore: currentBalance,
          balanceAfter: currentBalance - SUBSCRIPTION_COST
        }
      }),
      // 3. Set subscription active and expiry on User
      prisma.user.update({
        where: { id: userId },
        data: {
          pvcToolSubscriptionActive: true,
          pvcToolSubscriptionExpiry: expiryDate
        }
      })
    ]);

    return NextResponse.json({
      success: true,
      message: 'Advanced Features Subscription activated successfully!',
      expiryDate: expiryDate.toISOString(),
      balance: currentBalance - SUBSCRIPTION_COST
    });

  } catch (error) {
    console.error('Error activating advanced features subscription:', error);
    return NextResponse.json(
      { error: 'Failed to activate subscription. Please try again.' },
      { status: 500 }
    );
  }
}
