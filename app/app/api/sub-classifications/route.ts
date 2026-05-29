
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

// GET all sub-classifications
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const groupId = searchParams.get('groupId');

    const subClassifications = await prisma.subClassification.findMany({
      where: groupId ? { groupId } : undefined,
      include: {
        group: true
      },
      orderBy: { code: 'asc' }
    });

    return NextResponse.json({ subClassifications });
  } catch (error) {
    console.error('Error fetching sub-classifications:', error);
    return NextResponse.json(
      { error: 'Failed to fetch sub-classifications' },
      { status: 500 }
    );
  }
}

// POST create new sub-classification
export async function POST(request: NextRequest) {
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
      groupId,
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
    if (!groupId || !code || !name) {
      return NextResponse.json(
        { error: 'Group ID, code, and name are required' },
        { status: 400 }
      );
    }

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

    // Check if code already exists
    const existing = await prisma.subClassification.findUnique({
      where: { code }
    });

    if (existing) {
      return NextResponse.json(
        { error: 'Sub-classification with this code already exists' },
        { status: 409 }
      );
    }

    const subClassification = await prisma.subClassification.create({
      data: {
        groupId,
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

    return NextResponse.json({ subClassification }, { status: 201 });
  } catch (error) {
    console.error('Error creating sub-classification:', error);
    return NextResponse.json(
      { error: 'Failed to create sub-classification' },
      { status: 500 }
    );
  }
}
