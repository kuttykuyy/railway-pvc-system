
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

// GET all classification groups
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const groups = await prisma.classificationGroup.findMany({
      include: {
        subClassifications: {
          orderBy: { code: 'asc' }
        }
      },
      orderBy: { code: 'asc' }
    });

    return NextResponse.json({ groups });
  } catch (error) {
    console.error('Error fetching classification groups:', error);
    return NextResponse.json(
      { error: 'Failed to fetch classification groups' },
      { status: 500 }
    );
  }
}

// POST create new classification group
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
    const { code, name, description, isActive } = body;

    // Validate required fields
    if (!code || !name) {
      return NextResponse.json(
        { error: 'Code and name are required' },
        { status: 400 }
      );
    }

    // Check if code already exists
    const existing = await prisma.classificationGroup.findUnique({
      where: { code }
    });

    if (existing) {
      return NextResponse.json(
        { error: 'Classification group with this code already exists' },
        { status: 409 }
      );
    }

    const group = await prisma.classificationGroup.create({
      data: {
        code,
        name,
        description: description || null,
        isActive: isActive ?? true
      },
      include: {
        subClassifications: true
      }
    });

    return NextResponse.json({ group }, { status: 201 });
  } catch (error) {
    console.error('Error creating classification group:', error);
    return NextResponse.json(
      { error: 'Failed to create classification group' },
      { status: 500 }
    );
  }
}
