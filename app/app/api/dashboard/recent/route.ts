
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Force dynamic rendering for this route
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const isAdmin = user.role === 'admin';

    let whereClause: { userId?: string } = {};
    if (!isAdmin) {
      // Regular users see only their data
      whereClause = { userId: user.id };
    }

    // Get recent bills
    const recentBills = await prisma.bill.findMany({
      where: {
        contract: whereClause.userId ? { userId: whereClause.userId } : undefined,
      },
      include: {
        contract: true,
        billTransaction: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 10,
    });

    // Get recent contracts
    const recentContracts = await prisma.contract.findMany({
      where: whereClause,
      orderBy: {
        createdAt: 'desc',
      },
      take: 5,
    });

    // Get recent transactions
    const recentTransactions = await prisma.billTransaction.findMany({
      where: {
        userId: isAdmin ? undefined : user.id,
      },
      include: {
        bill: {
          include: {
            contract: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 5,
    });

    // Combine and format recent items
    const recentItems: any[] = [];

    // Add bills
    recentBills.forEach(bill => {
      recentItems.push({
        id: bill.id,
        type: 'bill',
        title: `Bill ${bill.billNo}`,
        subtitle: bill.contract.contractorName,
        timestamp: bill.createdAt,
        status: bill.billTransaction?.status === 'paid' ? 'completed' : 'pending',
        amount: bill.billAmount,
      });
    });

    // Add contracts
    recentContracts.forEach(contract => {
      recentItems.push({
        id: contract.id,
        type: 'contract',
        title: `Contract ${contract.agreementNo}`,
        subtitle: contract.contractorName,
        timestamp: contract.createdAt,
        status: 'completed',
      });
    });

    // Add transactions
    recentTransactions.forEach(transaction => {
      recentItems.push({
        id: transaction.id,
        type: 'payment',
        title: `Payment for ${transaction.bill.billNo}`,
        subtitle: transaction.bill.contract.contractorName,
        timestamp: transaction.createdAt,
        status: transaction.status === 'paid' ? 'completed' : transaction.status === 'failed' ? 'failed' : 'pending',
        amount: transaction.amount,
      });
    });

    // Sort by timestamp and limit
    const sortedItems = recentItems
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 10);

    return NextResponse.json(sortedItems);
  } catch (error) {
    console.error('Dashboard recent items error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
