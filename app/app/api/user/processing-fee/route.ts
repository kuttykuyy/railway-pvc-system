

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { validateApiAccess } from '@/lib/payment-validation';

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    // Validate API access
    const { authorized, user, message: authMessage } = await validateApiAccess(request);
    
    if (!authorized || !user) {
      return NextResponse.json(
        { error: authMessage || 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get user with billing settings
    const userData = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        isFreeAccount: true,
        customProcessingFee: true,
      },
    });

    if (!userData) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // If user has a free account, processing fee is 0
    if (userData.isFreeAccount) {
      return NextResponse.json({
        processingFee: 0,
        isFreeAccount: true,
        customFee: null,
        source: 'free_account',
      });
    }

    // If user has a custom processing fee, use it
    if (userData.customProcessingFee !== null) {
      return NextResponse.json({
        processingFee: userData.customProcessingFee,
        isFreeAccount: false,
        customFee: userData.customProcessingFee,
        source: 'custom_fee',
      });
    }

    // Otherwise, get the system default processing fee
    const systemSetting = await prisma.adminSettings.findUnique({
      where: { key: 'BILL_PROCESSING_COST' },
    });

    const defaultFee = systemSetting ? parseFloat(systemSetting.value) : 10;

    return NextResponse.json({
      processingFee: defaultFee,
      isFreeAccount: false,
      customFee: null,
      source: 'system_default',
    });
  } catch (error: any) {
    console.error('Error fetching processing fee:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
