
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { validateAdminAccess } from '@/lib/role-auth';

export const dynamic = "force-dynamic";

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
