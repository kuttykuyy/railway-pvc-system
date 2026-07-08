import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const subClassifications = await prisma.subClassification.findMany({
      where: { isActive: true },
      orderBy: { code: 'asc' },
      select: { id: true, code: true, name: true },
    });

    if (subClassifications.length > 0) {
      return NextResponse.json(subClassifications);
    }

    const legacy = await prisma.classification.findMany({
      where: { isActive: true },
      orderBy: { code: 'asc' },
      select: { id: true, code: true, name: true },
    });

    return NextResponse.json(legacy);
  } catch (error) {
    console.error('Error fetching classifications:', error);
    return NextResponse.json([], { status: 500 });
  }
}
