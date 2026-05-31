
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { validateApiAccess } from '@/lib/payment-validation';
import { getBaseMonth } from '@/lib/pvc-calculations';
import { getUserAccessibleContracts } from '@/lib/permissions';
import { checkPvcEligibility, generateEligibilityNote } from '@/lib/gcc-compliance';
import { normalizeAgreementNo } from '@/lib/railway-division-helper';

// Helper function to ensure base month values are available
async function ensureBaseMonthValues(baseMonth: Date) {
  try {
    // Get all price indices
    const allIndices = await prisma.priceIndex.findMany();
    
    // Normalize base month to first day of month
    const normalizedBaseMonth = new Date(baseMonth.getFullYear(), baseMonth.getMonth(), 1);
    
    for (const index of allIndices) {
      // Check if base month value already exists
      const existingValue = await prisma.monthlyIndexValue.findFirst({
        where: {
          priceIndexId: index.id,
          month: {
            gte: normalizedBaseMonth,
            lt: new Date(normalizedBaseMonth.getFullYear(), normalizedBaseMonth.getMonth() + 1, 1)
          }
        }
      });
      
      // If no value exists, create one using the static base value
      if (!existingValue) {
        await prisma.monthlyIndexValue.create({
          data: {
            priceIndexId: index.id,
            month: normalizedBaseMonth,
            value: index.baseValue,
            source: `Auto-populated base month value for ${index.name}`
          }
        });
      }
    }
  } catch (error) {
    console.error('Error ensuring base month values:', error);
    // Don't throw error - this is a best-effort operation
  }
}

export const dynamic = "force-dynamic";

// GET /api/contracts - Get all contracts (admin) or user's own contracts (user)
export async function GET(request: NextRequest) {
  try {
    // Validate API access
    const { authorized, user, message } = await validateApiAccess(request);
    
    if (!authorized) {
      return NextResponse.json(
        { error: message || 'Unauthorized' },
        { status: 401 }
      );
    }

    // null = admin (unrestricted) — skip ID filter to avoid loading all IDs into memory
    const accessibleContractIds = await getUserAccessibleContracts(user.id);
    const isUnrestricted = accessibleContractIds === null;

    if (!isUnrestricted && accessibleContractIds.length === 0) {
      return NextResponse.json([]);
    }

    const contractsWhere = isUnrestricted ? {} : { id: { in: accessibleContractIds } };

    const contracts = await prisma.contract.findMany({
      where: contractsWhere,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            name: true,
            email: true
          }
        },
        _count: {
          select: {
            bills: true,
            pvcCalculations: true
          }
        }
      }
    });
    
    return NextResponse.json(contracts);
  } catch (error) {
    console.error('Error fetching contracts:', error);
    return NextResponse.json(
      { error: 'Failed to fetch contracts' },
      { status: 500 }
    );
  }
}

// POST /api/contracts - Create new contract
export async function POST(request: NextRequest) {
  let agreementNoForError = 'unknown';
  
  try {
    // Validate API access
    const { authorized, user, message } = await validateApiAccess(request);
    
    if (!authorized) {
      return NextResponse.json(
        { error: message || 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { 
      agreementNo, 
      loaNo,
      loaDate,
      contractorName,
      contractorPhone,
      workDescription, 
      dateOfOpening,
      tenderAdvertisedValue,
      contractValue,
      completionPeriodMonths,
      hasRailwaySuppliedMaterials,
      railwaySuppliedMaterialsNote,
      coveringLetterDesignation,
      schedules
    } = body;
    
    // Store for error handling
    agreementNoForError = agreementNo;

    // Validate required fields
    if (!agreementNo || !contractorName || !workDescription || !dateOfOpening) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Normalize agreement number: uppercase, strip spaces/junk from segments
    const normalizedAgreementNo = normalizeAgreementNo(agreementNo);
    if (!normalizedAgreementNo) {
      return NextResponse.json(
        { error: 'Invalid Agreement Number format' },
        { status: 400 }
      );
    }
    agreementNoForError = normalizedAgreementNo;

    // Check for duplicate using normalized form (catches extra-letter abuse)
    const existingContract = await prisma.contract.findFirst({
      where: {
        OR: [
          { agreementNo: normalizedAgreementNo },
          { agreementNo: agreementNo.trim() }
        ]
      },
      select: {
        id: true,
        agreementNo: true,
        contractorName: true,
        user: {
          select: {
            name: true,
            email: true
          }
        }
      }
    });

    if (existingContract) {
      return NextResponse.json(
        {
          error: 'Contract with this Agreement Number already exists',
          details: `A contract with Agreement Number "${normalizedAgreementNo}" already exists in the system created by ${existingContract.user?.name || 'another user'}. Please use a different Agreement Number.`
        },
        { status: 409 }
      );
    }

    // Validate date
    const openingDate = new Date(dateOfOpening);
    if (isNaN(openingDate.getTime())) {
      return NextResponse.json(
        { error: 'Invalid date of opening provided' },
        { status: 400 }
      );
    }

    const baseMonth = getBaseMonth(openingDate);
    
    // Check PVC eligibility per GCC 46A.1 - use tender advertised value if available, otherwise contract value
    const pvcEligibilityResult = checkPvcEligibility(
      tenderAdvertisedValue || contractValue || null,
      completionPeriodMonths || null
    );
    
    const pvcEligibilityNote = generateEligibilityNote(
      tenderAdvertisedValue || contractValue || null,
      completionPeriodMonths || null
    );
    
    // Ensure base month index values are available for this contract
    await ensureBaseMonthValues(baseMonth);
    
    // Parse LOA date if provided
    const loaDateParsed = loaDate ? new Date(loaDate) : null;
    if (loaDate && loaDateParsed && isNaN(loaDateParsed.getTime())) {
      return NextResponse.json(
        { error: 'Invalid LOA date provided' },
        { status: 400 }
      );
    }

    const contract = await prisma.contract.create({
      data: {
        agreementNo: normalizedAgreementNo,
        loaNo,
        loaDate: loaDateParsed,
        contractorName,
        contractorPhone: contractorPhone || null,
        workDescription,
        dateOfOpening: openingDate,
        baseMonth,
        tenderAdvertisedValue: tenderAdvertisedValue || null,
        contractValue: contractValue || null,
        completionPeriodMonths: completionPeriodMonths || null,
        pvcApplicable: pvcEligibilityResult.isEligible,
        pvcEligibilityNote,
        hasRailwaySuppliedMaterials: hasRailwaySuppliedMaterials || false,
        railwaySuppliedMaterialsNote: railwaySuppliedMaterialsNote || null,
        coveringLetterDesignation: coveringLetterDesignation || null,
        schedules: Array.isArray(schedules) ? schedules.filter((s: string) => s && s.trim()) : [],
        userId: user.id
      },
      include: {
        user: {
          select: {
            name: true,
            email: true
          }
        },
        _count: {
          select: {
            bills: true,
            pvcCalculations: true
          }
        }
      }
    });
    
    return NextResponse.json(contract);
  } catch (error: any) {
    console.error('Error creating contract:', error);
    
    // Handle unique constraint violation for agreementNo
    if (error.code === 'P2002') {
      const field = error.meta?.target?.includes('agreementNo') ? 'Agreement Number' : 'field';
      return NextResponse.json(
        { 
          error: `Contract with this ${field} already exists`,
          details: `A contract with Agreement Number "${agreementNoForError}" is already in the system. Please use a different Agreement Number.`
        },
        { status: 409 } // Conflict status code for duplicate resource
      );
    }
    
    // Handle validation errors
    if (error.code === 'P2003') {
      return NextResponse.json(
        { error: 'Foreign key constraint failed. Please check your data.' },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { 
        error: 'Failed to create contract',
        details: process.env.NODE_ENV === 'development' ? error.message : 'An internal server error occurred'
      },
      { status: 500 }
    );
  }
}
