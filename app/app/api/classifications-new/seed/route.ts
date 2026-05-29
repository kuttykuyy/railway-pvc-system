/**
 * Seed GCC Classifications from gcc-classifications-data.ts
 * 
 * This endpoint populates the database with all standard GCC (General Conditions of Contract)
 * classifications. It can be triggered from the Classifications page UI via the "Seed Defaults" button.
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateAdminAccess } from '@/lib/role-auth';
import { prisma } from '@/lib/db';
import { GCC_CLASSIFICATIONS } from '@/lib/gcc-classifications-data';

// POST - Seed classifications from GCC data
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

    // Check existing classifications
    const existingCount = await prisma.classification.count();
    
    let created = 0;
    let skipped = 0;

    // Create classifications from GCC data
    for (const gcc of GCC_CLASSIFICATIONS) {
      // Check if classification with this code already exists
      const existing = await prisma.classification.findUnique({
        where: { code: gcc.code }
      });

      if (existing) {
        skipped++;
        continue;
      }

      // Create new classification
      await prisma.classification.create({
        data: {
          code: gcc.code,
          name: gcc.subClassification,
          description: gcc.description,
          fixed: gcc.components.fixed,
          labour: gcc.components.labour,
          steel: gcc.components.steel,
          cement: gcc.components.cement,
          plantMachinery: gcc.components.plantMachinery,
          fuel: gcc.components.fuel,
          otherMaterials: gcc.components.otherMaterials,
          explosives: gcc.components.explosives,
          isActive: true,
          isDefault: false
        }
      });

      created++;
    }

    const totalNow = existingCount + created;

    return NextResponse.json(
      {
        success: true,
        message: created > 0 
          ? `Successfully seeded ${created} GCC classifications` 
          : 'All GCC classifications already exist',
        stats: {
          created,
          skipped,
          existingBefore: existingCount,
          totalNow
        }
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error seeding classifications:', error);
    return NextResponse.json(
      { error: 'Failed to seed classifications', details: (error as Error).message },
      { status: 500 }
    );
  }
}
