
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { validateApiAccess } from '@/lib/payment-validation';

export const dynamic = "force-dynamic";

// GET /api/contracts/[id] - Get single contract
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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
    const isAdmin = user.role === 'admin' || user.email === '30prasath93@gmail.com';
    
    // Build where clause based on user role
    let whereClause: any = { id: params.id };
    
    // For non-admin users, only show their own contracts
    if (!isAdmin) {
      whereClause.userId = user.id;
    }

    const contract = await prisma.contract.findUnique({
      where: whereClause,
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
        { error: 'Contract not found or access denied' },
        { status: 404 }
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
  { params }: { params: { id: string } }
) {
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
    const isAdmin = user.role === 'admin' || user.email === '30prasath93@gmail.com';
    
    // Build where clause based on user role
    let whereClause: any = { id: params.id };
    
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
      schedules
    } = body;
    
    // Parse LOA date if provided
    const loaDateParsed = loaDate ? new Date(loaDate) : undefined;
    if (loaDate && loaDateParsed && isNaN(loaDateParsed.getTime())) {
      return NextResponse.json(
        { error: 'Invalid LOA date provided' },
        { status: 400 }
      );
    }

    const contract = await prisma.contract.update({
      where: { id: params.id },
      data: {
        agreementNo,
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
        schedules: schedules !== undefined ? (Array.isArray(schedules) ? schedules.filter((s: string) => s && s.trim()) : []) : undefined,
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
  } catch (error) {
    console.error('Error updating contract:', error);
    return NextResponse.json(
      { error: 'Failed to update contract' },
      { status: 500 }
    );
  }
}

// DELETE /api/contracts/[id] - Delete contract
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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
    const isAdmin = user.role === 'admin' || user.email === '30prasath93@gmail.com';
    
    // Build where clause based on user role
    let whereClause: any = { id: params.id };
    
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

    await prisma.contract.delete({
      where: { id: params.id }
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
  { params }: { params: { id: string } }
) {
  return PUT(request, { params });
}
