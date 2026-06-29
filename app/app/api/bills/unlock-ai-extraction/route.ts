import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { validateApiAccess } from '@/lib/payment-validation';
import { advancedCache } from '@/lib/advanced-cache';
import { getBillingSettings } from '@/lib/admin-settings';

export const dynamic = 'force-dynamic';

/**
 * POST /api/bills/unlock-ai-extraction
 * Body: { extractionId: string }
 * Deducts the AI extraction fee from user's credit balance and returns the full cached analysis details.
 */
export async function POST(request: Request) {
  try {
    // 1. Validate user is authenticated
    const { authorized, user, message } = await validateApiAccess(request);
    
    if (!authorized || !user) {
      return NextResponse.json(
        { error: message || 'Unauthorized' },
        { status: 401 }
      );
    }

    const userId = user.id;

    // 2. Parse request payload
    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON request body' },
        { status: 400 }
      );
    }

    const { extractionId } = body;
    if (!extractionId || typeof extractionId !== 'string') {
      return NextResponse.json(
        { error: 'extractionId is required' },
        { status: 400 }
      );
    }

    // 3. Fetch from cache
    const cachedData = advancedCache.get(`ai-extraction:${extractionId}`);
    if (!cachedData) {
      return NextResponse.json(
        { error: 'AI Extraction result has expired or is invalid. Please upload the PDF again.' },
        { status: 400 }
      );
    }

    // 4. Calculate cost based on user exemption status
    const isFreeOrExempt = 
      user.role === 'admin' || 
      user.role === 'superadmin' || 
      user.role === 'railway_official' || 
      user.role === 'RAILWAY_OFFICIAL' || 
      user.isFreeAccount ||
      user.customProcessingFee === 0;

    const billingSettings = await getBillingSettings();
    const unlockCost = isFreeOrExempt ? 0 : (billingSettings.aiExtractionCost || 50);

    // 5. If cost > 0, check balance and deduct credits
    if (unlockCost > 0) {
      const customerAccount = await prisma.customerAccount.findUnique({
        where: { userId }
      });

      const currentBalance = customerAccount?.creditBalance || 0;

      if (currentBalance < unlockCost) {
        return NextResponse.json(
          { 
            error: `Insufficient balance. Unlocking this extraction costs ₹${unlockCost}, but your credit balance is ₹${currentBalance}. Please top up your balance.`,
            currentBalance,
            cost: unlockCost
          },
          { status: 402 } // Payment Required
        );
      }

      // Deduct balance and record transaction atomically
      await prisma.$transaction([
        prisma.customerAccount.update({
          where: { userId },
          data: { creditBalance: { decrement: unlockCost } }
        }),
        prisma.creditTransaction.create({
          data: {
            userId,
            amount: unlockCost,
            type: 'deduct',
            reason: `Unlock AI PDF Bill Extraction (Ref: ${extractionId})`,
            balanceBefore: currentBalance,
            balanceAfter: currentBalance - unlockCost
          }
        })
      ]);
    }

    // 6. Return the full cached extraction data
    return NextResponse.json({
      success: true,
      message: 'AI Bill details unlocked successfully!',
      cost: unlockCost,
      data: cachedData
    });

  } catch (error) {
    console.error('Error unlocking AI extraction:', error);
    return NextResponse.json(
      { error: 'Failed to unlock AI extraction details. Please try again.' },
      { status: 500 }
    );
  }
}
