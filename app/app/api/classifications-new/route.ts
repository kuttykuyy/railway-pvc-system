
import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { validateAdminAccess } from '@/lib/role-auth';

const prisma = new PrismaClient();

// GET - List all main classifications (groups) with their sub-classifications
export async function GET(request: NextRequest) {
  try {
    // Fetch all classification groups with their sub-classifications
    const groups = await prisma.classificationGroup.findMany({
      where: { isActive: true },
      include: {
        subClassifications: {
          where: { isActive: true },
          orderBy: [
            { isDefault: 'desc' },
            { code: 'asc' }
          ]
        }
      },
      orderBy: { code: 'asc' }
    });

    // Transform the data to match the expected format
    const mainClassifications = groups.map((group: any) => ({
      id: group.id,
      code: group.code,
      name: group.name,
      description: group.description,
      isActive: group.isActive,
      subClassifications: group.subClassifications.map((subClass: any) => ({
        id: subClass.id,
        code: subClass.code,
        name: subClass.name,
        description: subClass.description,
        components: {
          fixed: subClass.fixed,
          labour: subClass.labour,
          steel: subClass.steel,
          cement: subClass.cement,
          plantMachinery: subClass.plantMachinery,
          fuel: subClass.fuel,
          otherMaterials: subClass.otherMaterials,
          explosives: subClass.explosives
        },
        isActive: subClass.isActive,
        isDefault: subClass.isDefault
      }))
    }));

    return NextResponse.json({ mainClassifications });
  } catch (error) {
    console.error('Error fetching classifications:', error);
    return NextResponse.json(
      { error: 'Failed to fetch classifications' },
      { status: 500 }
    );
  }
}
