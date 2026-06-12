import { prisma } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';




// GET - Get single classification
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const classification = await prisma.classification.findUnique({
      where: { id: id }
    });

    if (!classification) {
      return NextResponse.json(
        { error: 'Classification not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ classification });
  } catch (error) {
    console.error('Error fetching classification:', error);
    return NextResponse.json(
      { error: 'Failed to fetch classification' },
      { status: 500 }
    );
  }
}

// PUT - Update classification
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
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
      subClassifications = [],
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
        where: { id: { not: id } },
        data: { isDefault: false }
      });
    }

    const classification = await prisma.classification.update({
      where: { id: id },
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
        subClassifications: subClassifications, // Prisma Json field handles this automatically
        isActive,
        isDefault
      }
    });

    return NextResponse.json({ classification });
  } catch (error) {
    console.error('Error updating classification:', error);
    if ((error as any)?.code === 'P2002') {
      return NextResponse.json(
        { error: 'Classification code already exists' },
        { status: 400 }
      );
    }
    if ((error as any)?.code === 'P2025') {
      return NextResponse.json(
        { error: 'Classification not found' },
        { status: 404 }
      );
    }
    return NextResponse.json(
      { error: 'Failed to update classification' },
      { status: 500 }
    );
  }
}

// DELETE - Delete classification
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    // Check if classification exists and is not default
    const classification = await prisma.classification.findUnique({
      where: { id: id }
    });

    if (!classification) {
      return NextResponse.json(
        { error: 'Classification not found' },
        { status: 404 }
      );
    }

    if (classification.isDefault) {
      return NextResponse.json(
        { error: 'Cannot delete default classification' },
        { status: 400 }
      );
    }

    await prisma.classification.delete({
      where: { id: id }
    });

    return NextResponse.json({ message: 'Classification deleted successfully' });
  } catch (error) {
    console.error('Error deleting classification:', error);
    return NextResponse.json(
      { error: 'Failed to delete classification' },
      { status: 500 }
    );
  }
}
