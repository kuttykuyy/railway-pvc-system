import { prisma } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

import { validateAdminAccess } from '@/lib/role-auth';



// PUT - Update sub-classification
export async function PUT(
  request: NextRequest,
  { params }: { params: { subId: string } }
) {
  try {
    // Check admin access
    const { authorized, message } = await validateAdminAccess(request);
    
    if (!authorized) {
      return NextResponse.json(
        { error: message || 'Admin access required' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const {
      code,
      name,
      description,
      fixed,
      labour,
      steel,
      cement,
      plantMachinery,
      fuel,
      otherMaterials,
      explosives,
      isActive,
      isDefault
    } = body;

    // Validate required fields
    if (!code || !name) {
      return NextResponse.json(
        { error: 'Code and name are required' },
        { status: 400 }
      );
    }

    // Validate component percentages sum to 100 (excluding fixed)
    const totalPercentage = labour + steel + cement + plantMachinery + fuel + otherMaterials + explosives;
    if (Math.abs(totalPercentage - (100 - fixed)) > 0.01) {
      return NextResponse.json(
        { error: `Component percentages must sum to ${100 - fixed}% (excluding fixed ${fixed}%). Current total: ${totalPercentage}%` },
        { status: 400 }
      );
    }

    // If this is being set as default, remove default from others
    if (isDefault) {
      await prisma.classification.updateMany({
        where: {
          id: { not: params.subId }
        },
        data: { isDefault: false }
      });
    }

    // Update the sub-classification
    const subClassification = await prisma.classification.update({
      where: { id: params.subId },
      data: {
        code,
        name,
        description,
        fixed,
        labour,
        steel,
        cement,
        plantMachinery,
        fuel,
        otherMaterials,
        explosives,
        isActive,
        isDefault
      }
    });

    return NextResponse.json({ subClassification });
  } catch (error) {
    console.error('Error updating sub-classification:', error);
    if ((error as any)?.code === 'P2002') {
      return NextResponse.json(
        { error: 'Sub-classification code already exists' },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: 'Failed to update sub-classification' },
      { status: 500 }
    );
  }
}

// DELETE - Delete sub-classification
export async function DELETE(
  request: NextRequest,
  { params }: { params: { subId: string } }
) {
  try {
    // Check admin access
    const { authorized, message } = await validateAdminAccess(request);
    
    if (!authorized) {
      return NextResponse.json(
        { error: message || 'Admin access required' },
        { status: 403 }
      );
    }

    // Check if this sub-classification is being used by any bills
    const billsUsingThis = await prisma.bill.count({
      where: { workClassificationId: params.subId }
    });

    if (billsUsingThis > 0) {
      return NextResponse.json(
        { error: `Cannot delete sub-classification that is being used by ${billsUsingThis} bill(s)` },
        { status: 400 }
      );
    }

    // Delete the sub-classification
    await prisma.classification.delete({
      where: { id: params.subId }
    });

    return NextResponse.json({ message: 'Sub-classification deleted successfully' });
  } catch (error) {
    console.error('Error deleting sub-classification:', error);
    return NextResponse.json(
      { error: 'Failed to delete sub-classification' },
      { status: 500 }
    );
  }
}
