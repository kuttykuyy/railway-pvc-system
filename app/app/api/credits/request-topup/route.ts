
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { notifyCreditTopupRequest } from '@/lib/slack-webhook';

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Get request body
    const body = await request.json();
    const { requestedAmount, message } = body;

    // Validate requested amount if provided
    if (requestedAmount && (typeof requestedAmount !== 'number' || requestedAmount <= 0)) {
      return NextResponse.json(
        { error: 'Invalid requested amount' },
        { status: 400 }
      );
    }

    // Find user with billing info
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: {
        customerAccount: true,
      }
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Get current balance
    const currentBalance = user.customerAccount?.creditBalance || 0;

    // Send Slack notification
    const notificationSent = await notifyCreditTopupRequest({
      userName: user.name || user.email,
      userEmail: user.email,
      userId: user.id,
      currentBalance,
      requestedAmount: requestedAmount || undefined,
      message: message || undefined,
      requestDate: new Date()
    });

    if (!notificationSent) {
      console.error('Failed to send Slack notification for credit top-up request');
      // Don't fail the request, just log it
    }

    // Log the request in database for tracking (optional)
    try {
      await prisma.creditTransaction.create({
        data: {
          userId: user.id,
          amount: requestedAmount || 0,
          type: 'topup_request', // Special type for top-up requests
          reason: message || `Credit top-up request${requestedAmount ? ` - ₹${requestedAmount.toLocaleString('en-IN')}` : ''}`,
          balanceBefore: currentBalance,
          balanceAfter: currentBalance // No change yet
        }
      });
    } catch (logError) {
      // Non-critical error, just log it
      console.error('Failed to log credit request in database:', logError);
    }

    return NextResponse.json({
      success: true,
      message: 'Credit top-up request submitted successfully. Our team will contact you shortly.',
      notificationSent,
      supportContact: {
        email: 'admin@illall.in',
        whatsapp: '+91 9944776689'
      }
    });

  } catch (error) {
    console.error('Error processing credit top-up request:', error);
    return NextResponse.json(
      { error: 'Failed to process request' },
      { status: 500 }
    );
  }
}
