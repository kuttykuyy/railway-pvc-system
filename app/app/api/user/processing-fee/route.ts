

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
        manualFee: 0,
        aiFee: 0,
        isFreeAccount: true,
        customFee: null,
        source: 'free_account',
      });
    }

    // If user has a custom processing fee, use it
    if (userData.customProcessingFee !== null) {
      // A negotiated rate replaces both — it is not split by how the bill was entered.
      return NextResponse.json({
        processingFee: userData.customProcessingFee,
        manualFee: userData.customProcessingFee,
        aiFee: userData.customProcessingFee,
        isFreeAccount: false,
        customFee: userData.customProcessingFee,
        source: 'custom_fee',
      });
    }

    const isAiUploaded = request.nextUrl.searchParams.get('isAiUploaded') === 'true';

    // Both rates, always. The caller used to get only the one its query param selected,
    // so a screen that charges either way — bulk entry takes manual and AI-extracted
    // bills in the same batch — could only ever show one of them and had to describe
    // the other in words.
    const [manualSetting, aiSetting] = await Promise.all([
      prisma.adminSettings.findUnique({ where: { key: 'BILL_PROCESSING_COST' } }),
      prisma.adminSettings.findUnique({ where: { key: 'AI_BILL_PROCESSING_COST' } }),
    ]);
    const manualFee = manualSetting ? parseFloat(manualSetting.value) : 199;
    const aiFee = aiSetting ? parseFloat(aiSetting.value) : 499;

    return NextResponse.json({
      processingFee: isAiUploaded ? aiFee : manualFee,
      manualFee,
      aiFee,
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
