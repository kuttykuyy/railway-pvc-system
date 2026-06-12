
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';

// PUT - Update a subcategory
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
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

    // Check if subcategory exists
    const existing = await prisma.extensionSubcategory.findUnique({
      where: { id: id }
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Subcategory not found' },
        { status: 404 }
      );
    }

    // If code is being changed, check for duplicates
    if (data.code && data.code !== existing.code) {
      const duplicate = await prisma.extensionSubcategory.findUnique({
        where: { code: data.code }
      });

      if (duplicate) {
        return NextResponse.json(
          { error: 'Subcategory code already exists' },
          { status: 400 }
        );
      }
    }

    const subcategory = await prisma.extensionSubcategory.update({
      where: { id: id },
      data: {
        code: data.code,
        name: data.name,
        description: data.description,
        displayOrder: data.displayOrder,
        isActive: data.isActive
      }
    });

    return NextResponse.json({ subcategory });
  } catch (error) {
    console.error('Error updating subcategory:', error);
    return NextResponse.json(
      { error: 'Failed to update subcategory' },
      { status: 500 }
    );
  }
}

// DELETE - Delete a subcategory
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
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

    // Check if subcategory is in use
    const inUse = await prisma.contractExtension.findFirst({
      where: { extensionSubcategory: id }
    });

    if (inUse) {
      return NextResponse.json(
        { error: 'Cannot delete subcategory that is in use by extensions' },
        { status: 400 }
      );
    }

    await prisma.extensionSubcategory.delete({
      where: { id: id }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting subcategory:', error);
    return NextResponse.json(
      { error: 'Failed to delete subcategory' },
      { status: 500 }
    );
  }
}
