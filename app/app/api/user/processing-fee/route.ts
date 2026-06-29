

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
        role: true,
      },
    });

    if (!userData) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    const isFree = userData.isFreeAccount || userData.role === 'superadmin' || userData.role === 'railway_official';

    // If user has a free account, processing fee is 0
    if (isFree) {
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

    const isAiUploaded = request.nextUrl.searchParams.get('isAiUploaded') === 'true';
    const settingKey = isAiUploaded ? 'AI_BILL_PROCESSING_COST' : 'BILL_PROCESSING_COST';
    const defaultVal = isAiUploaded ? 499 : 199;

    // Otherwise, get the system default processing fee
    const systemSetting = await prisma.adminSettings.findUnique({
      where: { key: settingKey },
    });

    const defaultFee = systemSetting ? parseFloat(systemSetting.value) : defaultVal;

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
