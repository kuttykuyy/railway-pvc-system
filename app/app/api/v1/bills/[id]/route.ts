import { NextRequest, NextResponse } from 'next/server';
import { verifyApiKey, hasScope } from '@/lib/api-auth';
import { prisma } from '@/lib/db';

/**
 * GET /api/v1/bills/[id]
 * Get bill details by ID
 * Requires API key authentication
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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
    if (!hasScope(auth, 'bills:read')) {
      return NextResponse.json(
        { error: 'Insufficient permissions. Required scope: bills:read' },
        { status: 403 }
      );
    }

    // Fetch bill
    const bill = await prisma.bill.findFirst({
      where: {
        id: params.id,
        contract: {
          userId: auth.userId // Ensure user owns the contract
        }
      },
      include: {
        contract: {
          select: {
            id: true,
            agreementNo: true,
            contractorName: true,
            contractorPhone: true,
            workDescription: true,
            workClassification: true,
            baseMonth: true,
            dateOfOpening: true,
            loaNo: true,
            loaDate: true
          }
        },
        pvcCalculation: true,
        classificationEntries: {
          include: {
            classification: true,
            subClassification: true
          }
        },
        billTransaction: true,
        approvalHistory: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true
              }
            }
          },
          orderBy: { timestamp: 'desc' }
        }
      }
    });

    if (!bill) {
      return NextResponse.json(
        { error: 'Bill not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: bill
    });
  } catch (error) {
    console.error('API v1 bill detail error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
