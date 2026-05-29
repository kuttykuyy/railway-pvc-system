
import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { validateAdminAccess } from '@/lib/role-auth';

const prisma = new PrismaClient();

// GET - List all classifications
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const activeOnly = searchParams.get('active') === 'true';

    const where = activeOnly ? { isActive: true } : {};

    const classifications = await prisma.classification.findMany({
      where,
      orderBy: [
        { isDefault: 'desc' },
        { code: 'asc' }
      ]
    });

    // subClassifications is a Json field in Prisma, so it's already parsed
    // Just ensure it's an array
    type SubClassification = { code: string; name: string; description?: string };
    
    const classificationsWithParsedSubs = classifications.map((classification: any) => {
      let parsedSubClassifications: SubClassification[] = [];
      
      // Handle the Json field which could be null, array, or object
      if (classification.subClassifications) {
        if (Array.isArray(classification.subClassifications)) {
          parsedSubClassifications = classification.subClassifications as SubClassification[];
        } else {
          // If it's not an array, wrap it or default to empty array
          parsedSubClassifications = [];
        }
      }
      
      return {
        ...classification,
        subClassifications: parsedSubClassifications
      };
    });

    return NextResponse.json({ classifications: classificationsWithParsedSubs });
  } catch (error) {
    console.error('Error fetching classifications:', error);
    return NextResponse.json(
      { error: 'Failed to fetch classifications' },
      { status: 500 }
    );
  }
}

// POST - Create new classification (Admin only)
export async function POST(request: NextRequest) {
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
      subClassifications = [],
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

    const classification = await prisma.classification.create({
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
        isDefault
      }
    });

    return NextResponse.json({ classification }, { status: 201 });
  } catch (error) {
    console.error('Error creating classification:', error);
    if ((error as any)?.code === 'P2002') {
      return NextResponse.json(
        { error: 'Classification code already exists' },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: 'Failed to create classification' },
      { status: 500 }
    );
  }
}
