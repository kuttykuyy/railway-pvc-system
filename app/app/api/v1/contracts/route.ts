import { NextRequest, NextResponse } from 'next/server';
import { verifyApiKey, hasScope } from '@/lib/api-auth';
import { prisma } from '@/lib/db';

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/contracts
 * List all contracts for the authenticated user
 * Requires API key authentication
 */
export async function GET(request: NextRequest) {
  try {
    // Verify API key
    const auth = await verifyApiKey(request);

    if (!auth.authenticated) {
      return NextResponse.json(
        { error: auth.error || 'Authentication required' },
        { status: 401 }
      );
    }

    // Check scope
    if (!hasScope(auth, 'contracts:read')) {
      return NextResponse.json(
        { error: 'Insufficient permissions. Required scope: contracts:read' },
        { status: 403 }
      );
    }

    // Fetch contracts for the user
    const contracts = await prisma.contract.findMany({
      where: { userId: auth.userId },
      select: {
        id: true,
        agreementNo: true,
        contractorName: true,
        contractorPhone: true,
        workDescription: true,
        workClassification: true,
        dateOfOpening: true,
        baseMonth: true,
        loaNo: true,
        loaDate: true,
        contractValue: true,
        completionPeriodMonths: true,
        currentCompletionDate: true,
        originalCompletionDate: true,
        isExtended: true,
        pvcApplicable: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            bills: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return NextResponse.json({
      success: true,
      count: contracts.length,
      data: contracts
    });
  } catch (error) {
    console.error('API v1 contracts error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
