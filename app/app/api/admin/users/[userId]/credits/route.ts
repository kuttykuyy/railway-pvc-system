
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { validateAdminAccess } from '@/lib/role-auth';

export const dynamic = "force-dynamic";

// POST /api/admin/users/[userId]/credits - Add or deduct credits
export async function POST(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
  try {
    // Check admin access
    const { authorized, user: adminUser, message } = await validateAdminAccess(request);
    
    if (!authorized) {
      return NextResponse.json(
        { error: message || 'Admin access required' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { amount, type, reason } = body;

    if (!amount || !type || !reason) {
      return NextResponse.json(
        { error: 'Amount, type, and reason are required' },
        { status: 400 }
      );
    }

    if (type !== 'add' && type !== 'deduct') {
      return NextResponse.json(
        { error: 'Type must be "add" or "deduct"' },
        { status: 400 }
      );
    }

    const creditAmount = type === 'add' ? Math.abs(amount) : -Math.abs(amount);

    // Check if user exists
    const targetUser = await prisma.user.findUnique({
      where: { id: params.userId },
      include: {
        customerAccount: true
      }
    });

    if (!targetUser) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    if (!targetUser.customerAccount) {
      return NextResponse.json(
        { error: 'User has no customer account' },
        { status: 400 }
      );
    }

    const currentBalance = targetUser.customerAccount.creditBalance;
    const newBalance = currentBalance + creditAmount;

    // Prevent negative balance for deductions
    if (type === 'deduct' && newBalance < 0) {
      return NextResponse.json(
        { error: `Insufficient credits. Current balance: ${currentBalance}` },
        { status: 400 }
      );
    }

    // Update credit balance and create transaction record
    const result = await prisma.$transaction(async (prisma: any) => {
      // Update customer account balance
      const updatedAccount = await prisma.customerAccount.update({
        where: { userId: params.userId },
        data: {
          creditBalance: newBalance
        }
      });

      // Create credit transaction record
      const transaction = await prisma.creditTransaction.create({
        data: {
          userId: params.userId,
          amount: creditAmount,
          type: type,
          reason: reason,
          balanceBefore: currentBalance,
          balanceAfter: newBalance,
          adminUserId: adminUser.id,
          adminUserEmail: adminUser.email
        }
      });

      return { updatedAccount, transaction };
    });

    return NextResponse.json({
      message: `Credits ${type === 'add' ? 'added' : 'deducted'} successfully`,
      previousBalance: currentBalance,
      newBalance: newBalance,
      amountChanged: creditAmount,
      transaction: result.transaction
    });

  } catch (error) {
    console.error('Error managing credits:', error);
    return NextResponse.json(
      { error: 'Failed to manage credits' },
      { status: 500 }
    );
  }
}

// GET /api/admin/users/[userId]/credits - Get credit transaction history
export async function GET(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
  try {
    // Check admin access
    const { authorized, message } = await validateAdminAccess(request);
    
    if (!authorized) {
      return NextResponse.json(
        { error: message || 'Admin access required' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    // Get credit transactions for user
    const transactions = await prisma.creditTransaction.findMany({
      where: { userId: params.userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset
    });

    // Get total count
    const totalCount = await prisma.creditTransaction.count({
      where: { userId: params.userId }
    });

    // Get current balance
    const user = await prisma.user.findUnique({
      where: { id: params.userId },
      include: {
        customerAccount: {
          select: {
            creditBalance: true
          }
        }
      }
    });

    return NextResponse.json({
      transactions,
      totalCount,
      currentBalance: user?.customerAccount?.creditBalance || 0,
      pagination: {
        limit,
        offset,
        hasMore: offset + limit < totalCount
      }
    });

  } catch (error) {
    console.error('Error fetching credit history:', error);
    return NextResponse.json(
      { error: 'Failed to fetch credit history' },
      { status: 500 }
    );
  }
}
