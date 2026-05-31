import { prisma } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

import { validateAdminAccess } from '@/lib/role-auth';



// POST - Create new sub-classification under a main classification
export async function POST(
  request: NextRequest,
  { params }: { params: { mainId: string } }
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
      fixed = 15,
      labour = 20,
      steel = 0,
      cement = 0,
      plantMachinery = 20,
      fuel = 15,
      otherMaterials = 20,
      explosives = 10,
      isActive = true,
      isDefault = false
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
        data: { isDefault: false }
      });
    }

    // Create the sub-classification in the existing Classification table
    const subClassification = await prisma.classification.create({
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
        subClassifications: [], // Empty array for now
        isActive,
        isDefault
      }
    });

    return NextResponse.json({ subClassification }, { status: 201 });
  } catch (error) {
    console.error('Error creating sub-classification:', error);
    if ((error as any)?.code === 'P2002') {
      return NextResponse.json(
        { error: 'Sub-classification code already exists' },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: 'Failed to create sub-classification' },
      { status: 500 }
    );
  }
}
