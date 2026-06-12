
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

// GET single sub-classification
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const subClassification = await prisma.subClassification.findUnique({
      where: { id: id },
      include: {
        group: true
      }
    });

    if (!subClassification) {
      return NextResponse.json(
        { error: 'Sub-classification not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ subClassification });
  } catch (error) {
    console.error('Error fetching sub-classification:', error);
    return NextResponse.json(
      { error: 'Failed to fetch sub-classification' },
      { status: 500 }
    );
  }
}

// PUT update sub-classification
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin
    const user = await prisma.user.findUnique({
      where: { email: session.user?.email || '' }
    });

    if (user?.role !== 'admin') {
      return NextResponse.json(
        { error: 'Admin access required' },
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

    // Validate percentages (excluding fixed)
    const totalPercentage =
      (labour || 0) +
      (steel || 0) +
      (cement || 0) +
      (plantMachinery || 0) +
      (fuel || 0) +
      (otherMaterials || 0) +
      (explosives || 0);

    const fixedValue = fixed ?? 15;
    const expectedTotal = 100 - fixedValue;

    if (Math.abs(totalPercentage - expectedTotal) > 0.01) {
      return NextResponse.json(
        {
          error: `Component percentages must sum to ${expectedTotal}% (excluding fixed ${fixedValue}%). Current total: ${totalPercentage}%`
        },
        { status: 400 }
      );
    }

    const subClassification = await prisma.subClassification.update({
      where: { id: id },
      data: {
        code,
        name,
        description: description || null,
        fixed: fixedValue,
        labour: labour || 0,
        steel: steel || 0,
        cement: cement || 0,
        plantMachinery: plantMachinery || 0,
        fuel: fuel || 0,
        otherMaterials: otherMaterials || 0,
        explosives: explosives || 0,
        isActive: isActive ?? true,
        isDefault: isDefault ?? false
      },
      include: {
        group: true
      }
    });

    return NextResponse.json({ subClassification });
  } catch (error) {
    console.error('Error updating sub-classification:', error);
    return NextResponse.json(
      { error: 'Failed to update sub-classification' },
      { status: 500 }
    );
  }
}

// DELETE sub-classification
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin
    const user = await prisma.user.findUnique({
      where: { email: session.user?.email || '' }
    });

    if (user?.role !== 'admin') {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      );
    }

    await prisma.subClassification.delete({
      where: { id: id }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting sub-classification:', error);
    return NextResponse.json(
      { error: 'Failed to delete sub-classification' },
      { status: 500 }
    );
  }
}
