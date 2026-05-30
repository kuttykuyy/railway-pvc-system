/**
 * External API: Contracts
 * Allows external apps to list available contracts
 * 
 * GET /api/external/contracts - List contracts
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { validateExternalApiKey } from '@/lib/external-api-auth';

export const dynamic = 'force-dynamic';

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders });
}

/**
 * GET /api/external/contracts
 * List contracts for the authenticated user
 */
export async function GET(request: NextRequest) {
  try {
    // Validate API key
    const auth = await validateExternalApiKey(request, 'contracts:read');
    if (!auth.valid) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: 401, headers: corsHeaders }
      );
    }
    
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100);
    const skip = (page - 1) * limit;
    const search = searchParams.get('search') || '';
    
    // Build query - properly typed for Prisma
    // eslint-disable-next-line
    const where: any = {
      userId: auth.userId
    };
    
    if (search) {
      where.OR = [
        { agreementNo: { contains: search, mode: 'insensitive' } },
        { contractorName: { contains: search, mode: 'insensitive' } },
        { workDescription: { contains: search, mode: 'insensitive' } }
      ];
    }
    
    // Get total count
    const total = await prisma.contract.count({ where });
    
    // Get contracts with bill count
    const contracts = await prisma.contract.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        agreementNo: true,
        contractorName: true,
        workDescription: true,
        baseMonth: true,
        loaDate: true,
        completionPeriodMonths: true,
        originalCompletionDate: true,
        currentCompletionDate: true,
        isExtended: true,
        extensionType: true,
        contractValue: true,
        createdAt: true,
        _count: {
          select: { bills: true }
        }
      }
    });
    
    // Format response
    const formattedContracts = contracts.map(c => ({
      id: c.id,
      agreementNo: c.agreementNo,
      contractorName: c.contractorName,
      workDescription: c.workDescription,
      baseMonth: c.baseMonth,
      loaDate: c.loaDate,
      completionPeriodMonths: c.completionPeriodMonths,
      originalCompletionDate: c.originalCompletionDate,
      currentCompletionDate: c.currentCompletionDate,
      isExtended: c.isExtended,
      extensionType: c.extensionType,
      contractValue: c.contractValue,
      billCount: c._count.bills,
      createdAt: c.createdAt
    }));
    
    return NextResponse.json({
      success: true,
      data: formattedContracts,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    }, { headers: corsHeaders });
    
  } catch (error) {
    console.error('[ExternalAPI] GET contracts error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch contracts' },
      { status: 500, headers: corsHeaders }
    );
  }
}
