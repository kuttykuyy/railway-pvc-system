
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { validateAdminAccess } from '@/lib/role-auth';

export const dynamic = "force-dynamic";

// POST /api/admin/users - Repair missing billing accounts for legacy/OAuth users
export async function POST(request: NextRequest) {
  try {
    const { authorized, message } = await validateAdminAccess(request);
    if (!authorized) {
      return NextResponse.json(
        { error: message || 'Admin access required' },
        { status: 403 },
      );
    }

    const usersWithoutAccounts = await prisma.user.findMany({
      where: { customerAccount: null },
      select: { id: true },
    });

    if (usersWithoutAccounts.length > 0) {
      await prisma.customerAccount.createMany({
        data: usersWithoutAccounts.map(user => ({
          userId: user.id,
          status: 'active',
          currentTier: 'standard',
          creditBalance: 0,
          monthlyBillCount: 0,
          currentMonthBills: 0,
          lastMonthBills: 0,
        })),
        skipDuplicates: true,
      });
    }

    return NextResponse.json({ repaired: usersWithoutAccounts.length });
  } catch (error) {
    console.error('Error repairing customer accounts:', error);
    return NextResponse.json(
      { error: 'Failed to repair customer accounts' },
      { status: 500 },
    );
  }
}

// GET /api/admin/users - Get all users for admin management
export async function GET(request: NextRequest) {
  try {
    // Check admin access
    const { authorized, message } = await validateAdminAccess(request);
    
    if (!authorized) {
      return NextResponse.json(
        { error: message || 'Admin access required' },
        { status: 403 }
      );
    }

    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        emailVerified: true,
        role: true,
        totalBillsProcessed: true,
        freeTrialUsed: true,
        isTrialActive: true,
        customProcessingFee: true,
        isFreeAccount: true,
        contractLimitOverride: true,
        // Scopes what a department user can see; the role dialog sets it.
        railwayZone: true,
        createdAt: true,
        customerAccount: {
          select: {
            creditBalance: true,
            currentTier: true,
            monthlyBillCount: true,
            status: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return NextResponse.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    return NextResponse.json(
      { error: 'Failed to fetch users' },
      { status: 500 }
    );
  }
}
