import { NextRequest, NextResponse } from 'next/server';
import { verifyApiKey, hasScope } from '@/lib/api-auth';
import { prisma } from '@/lib/db';

/**
 * GET /api/v1/contracts/[id]
 * Get contract details by ID
 * Requires API key authentication
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
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

    // Fetch contract
    const contract = await prisma.contract.findFirst({
      where: {
        id: id,
        userId: auth.userId // Ensure user owns this contract
      },
      include: {
        bills: {
          select: {
            id: true,
            billNo: true,
            billAmount: true,
            grossBillAmount: true,
            dateOfMeasurement: true,
            quarter: true,
            status: true,
            isFinalPvc: true,
            pvcNumber: true,
            createdAt: true
          },
          orderBy: { dateOfMeasurement: 'desc' }
        },
        extensions: {
          select: {
            id: true,
            approvalDate: true,
            extendedCompletionDate: true,
            extensionReason: true,
            extensionType: true,
            extensionDuration: true
          },
          orderBy: { approvalDate: 'desc' }
        },
        _count: {
          select: {
            pvcCalculations: true
          }
        }
      }
    });

    if (!contract) {
      return NextResponse.json(
        { error: 'Contract not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: contract
    });
  } catch (error) {
    console.error('API v1 contract detail error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
