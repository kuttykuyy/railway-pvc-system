import { NextRequest, NextResponse } from 'next/server';
import { verifyApiKey, hasScope } from '@/lib/api-auth';
import { prisma } from '@/lib/db';

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/bills
 * List all bills for the authenticated user
 * Requires API key authentication
 * 
 * Query parameters:
 * - contractId: Filter by contract ID
 * - status: Filter by status (draft, pending, approved, rejected)
 * - limit: Number of results (default: 50, max: 200)
 * - offset: Pagination offset
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
    if (!hasScope(auth, 'bills:read')) {
      return NextResponse.json(
        { error: 'Insufficient permissions. Required scope: bills:read' },
        { status: 403 }
      );
    }

    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const contractId = searchParams.get('contractId');
    const status = searchParams.get('status');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200);
    const offset = parseInt(searchParams.get('offset') || '0');

    // Build where clause
    const where: any = {
      contract: {
        userId: auth.userId // Only return bills for contracts owned by the API key user
      }
    };

    if (contractId) {
      where.contractId = contractId;
    }

    if (status) {
      where.status = status;
    }

    // Fetch bills
    const [bills, total] = await Promise.all([
      prisma.bill.findMany({
        where,
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
          zone: true,
          cementAmount: true,
          steelAmount: true,
          selectedSteelComponent: true,
          isChargeable: true,
          processingFee: true,
          createdAt: true,
          updatedAt: true,
          contract: {
            select: {
              id: true,
              agreementNo: true,
              contractorName: true,
              workDescription: true
            }
          },
          pvcCalculation: {
            select: {
              totalPvc: true,
              labourPvc: true,
              cementPvc: true,
              steelPvc: true,
              otherMaterialsPvc: true,
              plantMachineryPvc: true,
              fuelPowerPvc: true
            }
          }
        },
        orderBy: { dateOfMeasurement: 'desc' },
        take: limit,
        skip: offset
      }),
      prisma.bill.count({ where })
    ]);

    return NextResponse.json({
      success: true,
      count: bills.length,
      total,
      limit,
      offset,
      data: bills
    });
  } catch (error) {
    console.error('API v1 bills error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
