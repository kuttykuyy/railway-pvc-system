
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getQuarterFromDate, calculateTotalPvc, calculateClassificationBasedPvc, calculateClassificationBasedPvcWithComponents, calculateDedicatedCementPvc, calculateDedicatedSteelPvc, calculateWeightedComponents } from '@/lib/pvc-calculations';
import { getQuarterlyAverages } from '@/lib/db-utils';
import { validateApiAccess, validateBillProcessing } from '@/lib/payment-validation';
import { getClientRoleInfo } from '@/lib/role-auth';
import { calculateExtensionCompliantPvc } from '@/lib/extension-compliance';
// Payment processing imports
import { getBillingSettings } from '@/lib/admin-settings';
import { getUserAccessibleBills, checkUserContractAccess } from '@/lib/permissions';
import { validateMeasurementDateAgainstProvisionalIndices } from '@/lib/provisional-validation';
import { handleApiError, AppError } from '@/lib/error-handler';
import { isBillUsingProvisionalIndices } from '@/lib/index-status';
import { recalculateCumulativePvcForContract } from '@/lib/recalculateCumulativePvc';
import { withTimeout, TIMEOUT_DEFAULTS } from '@/lib/api-timeout';
import { getPaginationParams, createPaginatedResponse } from '@/lib/api-helpers';
import rateLimiter, { RATE_LIMITS, getIdentifier } from '@/lib/rate-limiter';
import { PVCCalculationLogger } from '@/lib/pvc-calculation-logger';

export const dynamic = "force-dynamic";
export const revalidate = 0; // Disable all caching

// GET /api/bills - Get all bills with pagination
export async function GET(request: NextRequest) {
  try {
    // Rate limiting
    const identifier = getIdentifier(request);
    const rateLimit = rateLimiter.check(identifier, RATE_LIMITS.API.limit, RATE_LIMITS.API.windowMs);
    
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { 
          error: 'Rate limit exceeded',
          message: `Too many requests. Please try again in ${Math.ceil(rateLimit.resetIn / 1000)} seconds.`
        },
        { 
          status: 429,
          headers: {
            'Retry-After': Math.ceil(rateLimit.resetIn / 1000).toString(),
          }
        }
      );
    }

    // Execute with timeout protection
    return await withTimeout(
      (async () => {
        // Validate API access
        const { authorized, user, message: authMessage } = await validateApiAccess(request);
        
        if (!authorized) {
          return NextResponse.json(
            { error: authMessage || 'Unauthorized' },
            { status: 401 }
          );
        }

        const { searchParams } = new URL(request.url);
        const contractId = searchParams.get('contractId');
        
        // Get pagination parameters
        const { page, limit, skip } = getPaginationParams(request);
        
        // Get accessible bill IDs based on permissions
        let accessibleBillIds = await getUserAccessibleBills(user.id);
        
        // If contractId is specified, filter by contract and check contract access
        if (contractId) {
          const contractAccess = await checkUserContractAccess(user.id, contractId);
          if (!contractAccess?.canView) {
            return NextResponse.json({ error: 'Access denied to this contract' }, { status: 403 });
          }
          
          // Get bills only from this contract that user has access to
          const contractBills = await prisma.bill.findMany({
            where: { 
              contractId: contractId,
              id: { in: accessibleBillIds }
            },
            select: { id: true }
          });
          
          accessibleBillIds = contractBills.map(b => b.id);
        }
        
        if (accessibleBillIds.length === 0) {
          return NextResponse.json(
            createPaginatedResponse([], 0, page, limit)
          );
        }
        
        // Get total count for pagination
        const total = await prisma.bill.count({
          where: {
            id: { in: accessibleBillIds }
          }
        });
        
        // Get paginated bills
        const bills = await prisma.bill.findMany({
          where: {
            id: { in: accessibleBillIds }
          },
          orderBy: { dateOfMeasurement: 'desc' },
          skip,
          take: limit,
          include: {
            contract: {
              select: {
                id: true,
                agreementNo: true,
                contractorName: true,
                contractorPhone: true,
                workDescription: true,
                isExtended: true,
                extensionType: true,
                coveringLetterDesignation: true,
                loaDate: true,
                baseMonth: true,
                user: {
                  select: {
                    id: true,
                    name: true,
                    email: true
                  }
                }
              }
            },
            workClassification: true,
            classificationEntries: {
              include: {
                classification: true,
                subClassification: true
              }
            },
            pvcCalculation: true,
            billTransaction: true
          }
        });
        
        // Add provisional/final status to each bill
        const billsWithStatus = await Promise.all(
          bills.map(async (bill) => {
            const indicesStatus = await isBillUsingProvisionalIndices(
              bill.quarter,
              bill.contract.baseMonth
            );
            
            return {
              ...bill,
              indicesStatus: {
                isProvisional: indicesStatus.isProvisional,
                provisionalCount: indicesStatus.provisionalCount,
                totalCount: indicesStatus.totalCount
              }
            };
          })
        );
        
        // Create paginated response
        const response = createPaginatedResponse(billsWithStatus, total, page, limit);
        
        return NextResponse.json(response, {
          headers: {
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0',
            'X-RateLimit-Remaining': rateLimit.remaining.toString(),
          }
        });
      })(),
      TIMEOUT_DEFAULTS.STANDARD,
      'get-bills'
    );
  } catch (error) {
    console.error('Error fetching bills:', error);
    const { message, code, statusCode } = handleApiError(error);
    return NextResponse.json(
      { error: message, code },
      { status: statusCode }
    );
  }
}
