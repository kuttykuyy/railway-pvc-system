import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { validateApiAccess } from '@/lib/payment-validation';
import { normalizeAgreementNo, parseAgreementNumber } from '@/lib/railway-division-helper';
import { normalizeSchedules } from '@/lib/contract-schedules';

export const dynamic = "force-dynamic";

// GET /api/contracts/[id] - Get single contract
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    // Validate API access
    const { authorized, user, message } = await validateApiAccess(request);
    
    if (!authorized) {
      return NextResponse.json(
        { error: message || 'Unauthorized' },
        { status: 401 }
      );
    }

    // Check if user is admin
    const isAdmin = user.role === 'admin' || user.role === 'superadmin';
    
    // Fetch the contract first
    const contract = await prisma.contract.findUnique({
      where: { id: id },
      include: {
        user: {
          select: {
            name: true,
            email: true,
            division: true,
            divisionName: true,
            railwayZone: true,
            railwayZoneName: true
          }
        },
        bills: {
          orderBy: { dateOfMeasurement: 'desc' },
          include: {
            pvcCalculation: true
          }
        },
        pvcCalculations: {
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    if (!contract) {
      return NextResponse.json(
        { error: 'Contract not found' },
        { status: 404 }
      );
    }

    // Authorization check
    let hasAccess = false;
    if (isAdmin) {
      hasAccess = true;
    } else if (contract.userId === user.id) {
      hasAccess = true;
    } else if (user.role === 'railway_official') {
      const parsed = parseAgreementNumber(contract.agreementNo);
      if (parsed && user.railwayZone && parsed.zone.toUpperCase() === user.railwayZone.toUpperCase()) {
        hasAccess = true;
      }
    } else {
      // Check explicit access
      const explicitAccess = await prisma.userContractAccess.findUnique({
        where: {
          userId_contractId: {
            userId: user.id,
            contractId: contract.id
          }
        }
      });
      if (explicitAccess && explicitAccess.isActive) {
        hasAccess = true;
      }
    }

    if (!hasAccess) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      );
    }
    
    return NextResponse.json(contract);
  } catch (error) {
    console.error('Error fetching contract:', error);
    return NextResponse.json(
      { error: 'Failed to fetch contract' },
      { status: 500 }
    );
  }
}

// PUT /api/contracts/[id] - Update contract
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
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

    // Check if user is admin
    const isAdmin = user.role === 'admin' || user.role === 'superadmin';
    
    // Build where clause based on user role
    let whereClause: any = { id: id };
    
    // For non-admin users, only allow updating their own contracts
    if (!isAdmin) {
      whereClause.userId = user.id;
    }

    // First check if contract exists and user has access
    const existingContract = await prisma.contract.findUnique({
      where: whereClause
    });

    if (!existingContract) {
      return NextResponse.json(
        { error: 'Contract not found or access denied' },
        { status: 404 }
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
      schedules,
      rebatePercentage
    } = body;
    
    agreementNoForError = agreementNo || 'unknown';

    const normalizedAgreementNo = agreementNo ? normalizeAgreementNo(agreementNo) : existingContract.agreementNo;
    if (!normalizedAgreementNo) {
      return NextResponse.json(
        { error: 'Invalid Agreement Number format' },
        { status: 400 }
      );
    }
    agreementNoForError = normalizedAgreementNo;

    const duplicateContract = await prisma.contract.findFirst({
      where: {
        id: { not: id },
        agreementNo: { equals: normalizedAgreementNo, mode: 'insensitive' },
      },
      select: { id: true },
    });
    if (duplicateContract) {
      return NextResponse.json(
        {
          error: 'Contract with this Agreement Number already exists',
          details: `A contract with Agreement Number "${normalizedAgreementNo}" is already in the system. Please use a different Agreement Number.`,
        },
        { status: 409 }
      );
    }
    
    // Parse LOA date if provided
    const loaDateParsed = loaDate ? new Date(loaDate) : undefined;
    if (loaDate && loaDateParsed && isNaN(loaDateParsed.getTime())) {
      return NextResponse.json(
        { error: 'Invalid LOA date provided' },
        { status: 400 }
      );
    }

    const contract = await prisma.contract.update({
      where: { id: id },
      data: {
        agreementNo: normalizedAgreementNo,
        loaNo,
        loaDate: loaDateParsed !== undefined ? loaDateParsed : undefined,
        contractorName,
        contractorPhone: contractorPhone !== undefined ? contractorPhone : undefined,
        workDescription,
        tenderAdvertisedValue: tenderAdvertisedValue !== undefined ? tenderAdvertisedValue : undefined,
        contractValue: contractValue !== undefined ? contractValue : undefined,
        completionPeriodMonths: completionPeriodMonths !== undefined ? completionPeriodMonths : undefined,
        hasRailwaySuppliedMaterials: hasRailwaySuppliedMaterials !== undefined ? hasRailwaySuppliedMaterials : undefined,
        railwaySuppliedMaterialsNote: railwaySuppliedMaterialsNote !== undefined ? railwaySuppliedMaterialsNote : undefined,
        coveringLetterDesignation: coveringLetterDesignation !== undefined ? coveringLetterDesignation : undefined,
        // Accepts both the legacy string[] and the newer per-schedule rate objects.
        schedules: schedules !== undefined ? normalizeSchedules(schedules) : undefined,
        // Rebate is agreed once for the whole agreement; clamp to 0–100 (or null).
        rebatePercentage: rebatePercentage !== undefined
          ? (() => {
              if (rebatePercentage === null || rebatePercentage === '') return null;
              const n = Number(rebatePercentage);
              return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
            })()
          : undefined,
        ...(dateOfOpening && {
          dateOfOpening: new Date(dateOfOpening),
          baseMonth: new Date(new Date(dateOfOpening).setMonth(new Date(dateOfOpening).getMonth() - 1))
        })
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
    console.error('Error updating contract:', error);
    
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
    
    return NextResponse.json(
      { 
        error: 'Failed to update contract',
        details: process.env.NODE_ENV === 'development' ? error.message : 'An internal server error occurred'
      },
      { status: 500 }
    );
  }
}

// DELETE /api/contracts/[id] - Delete contract
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    // Validate API access
    const { authorized, user, message } = await validateApiAccess(request);
    
    if (!authorized) {
      return NextResponse.json(
        { error: message || 'Unauthorized' },
        { status: 401 }
      );
    }

    // Check if user is admin
    const isAdmin = user.role === 'admin' || user.role === 'superadmin';
    
    // Build where clause based on user role
    let whereClause: any = { id: id };
    
    // For non-admin users, only allow deleting their own contracts
    if (!isAdmin) {
      whereClause.userId = user.id;
    }

    // First check if contract exists and user has access
    const existingContract = await prisma.contract.findUnique({
      where: whereClause
    });

    if (!existingContract) {
      return NextResponse.json(
        { error: 'Contract not found or access denied' },
        { status: 404 }
      );
    }

    const contractBills = await prisma.bill.findMany({
      where: { contractId: id },
      select: { id: true },
    });
    const billTransactions = contractBills.length > 0
      ? await prisma.billTransaction.findMany({
          where: { billId: { in: contractBills.map(bill => bill.id) } },
          select: { id: true },
        })
      : [];

    await prisma.$transaction(async tx => {
      if (billTransactions.length > 0) {
        await tx.invoiceItem.deleteMany({
          where: { billTransactionId: { in: billTransactions.map(transaction => transaction.id) } },
        });
      }
      await tx.contract.delete({ where: { id } });
    });

    console.info('[contracts] Contract deleted', {
      contractId: id,
      ownerUserId: existingContract.userId,
      deletedByUserId: user.id,
      deletedByRole: user.role,
      billCount: contractBills.length,
    });
    
    return NextResponse.json({ message: 'Contract deleted successfully' });
  } catch (error) {
    console.error('Error deleting contract:', error);
    return NextResponse.json(
      { error: 'Failed to delete contract' },
      { status: 500 }
    );
  }
}

// PATCH /api/contracts/[id] - Partially update contract (alias for PUT)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return PUT(request, { params });
}
