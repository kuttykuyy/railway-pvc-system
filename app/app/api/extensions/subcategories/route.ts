
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';

// GET - Fetch all extension subcategories
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const subcategories = await prisma.extensionSubcategory.findMany({
      orderBy: { displayOrder: 'asc' }
    });

    return NextResponse.json({ subcategories });
  } catch (error) {
    console.error('Error fetching subcategories:', error);
    return NextResponse.json(
      { error: 'Failed to fetch subcategories' },
      { status: 500 }
    );
  }
}

// POST - Create a new subcategory
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin
    const user = await prisma.user.findUnique({
      where: { email: session.user.email! }
    });

    if (user?.role !== 'admin') {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      );
    }

    const data = await request.json();

    // Validate required fields
    if (!data.code || !data.name) {
      return NextResponse.json(
        { error: 'Code and name are required' },
        { status: 400 }
      );
    }

    // Check if code already exists
    const existing = await prisma.extensionSubcategory.findUnique({
      where: { code: data.code }
    });

    if (existing) {
      return NextResponse.json(
        { error: 'Subcategory code already exists' },
        { status: 400 }
      );
    }

    const subcategory = await prisma.extensionSubcategory.create({
      data: {
        code: data.code,
        name: data.name,
        description: data.description || '',
        displayOrder: data.displayOrder || 999,
        isActive: data.isActive !== undefined ? data.isActive : true
      }
    });

    return NextResponse.json({ subcategory }, { status: 201 });
  } catch (error) {
    console.error('Error creating subcategory:', error);
    return NextResponse.json(
      { error: 'Failed to create subcategory' },
      { status: 500 }
    );
  }
}
