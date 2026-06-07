
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getBillingSettings } from '@/lib/admin-settings';

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session || !session.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isFreeAccount: true,
        freeTrialUsed: true,
        customProcessingFee: true,
        designation: true,
        department: true,
        railwayZone: true,
        division: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const billingSettings = await getBillingSettings();
    const freeTrialLimit = billingSettings.freeTrialBills || 1;

    const isFreeRole = user.role === 'admin' || user.role === 'superadmin' ||
      user.role === 'railway_official' || user.isFreeAccount || user.customProcessingFee === 0;
    const hasFreeTrial = !isFreeRole && user.freeTrialUsed < freeTrialLimit;

    return NextResponse.json({ ...user, freeTrialLimit, hasFreeTrial });
  } catch (error) {
    console.error('Error fetching user profile:', error);
    return NextResponse.json(
      { error: 'Failed to fetch user profile' },
      { status: 500 }
    );
  }
}
