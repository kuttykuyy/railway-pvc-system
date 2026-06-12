
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

// GET single classification group
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

    const group = await prisma.classificationGroup.findUnique({
      where: { id: id },
      include: {
        subClassifications: {
          orderBy: { code: 'asc' }
        }
      }
    });

    if (!group) {
      return NextResponse.json(
        { error: 'Classification group not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ group });
  } catch (error) {
    console.error('Error fetching classification group:', error);
    return NextResponse.json(
      { error: 'Failed to fetch classification group' },
      { status: 500 }
    );
  }
}

// PUT update classification group
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
    const { code, name, description, isActive } = body;

    const group = await prisma.classificationGroup.update({
      where: { id: id },
      data: {
        code,
        name,
        description: description || null,
        isActive: isActive ?? true
      },
      include: {
        subClassifications: {
          orderBy: { code: 'asc' }
        }
      }
    });

    return NextResponse.json({ group });
  } catch (error) {
    console.error('Error updating classification group:', error);
    return NextResponse.json(
      { error: 'Failed to update classification group' },
      { status: 500 }
    );
  }
}

// DELETE classification group
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

    await prisma.classificationGroup.delete({
      where: { id: id }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting classification group:', error);
    return NextResponse.json(
      { error: 'Failed to delete classification group' },
      { status: 500 }
    );
  }
}
