import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

// PATCH - Update API key (activate/deactivate)
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || session.user.role !== 'admin') {
      return NextResponse.json(
        { error: 'Unauthorized. Admin access required.' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { isActive, name, description, scopes, rateLimit, expiresAt } = body;

    const updateData: any = {};
    if (isActive !== undefined) updateData.isActive = isActive;
    if (name) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (scopes) updateData.scopes = scopes;
    if (rateLimit) updateData.rateLimit = rateLimit;
    if (expiresAt !== undefined) updateData.expiresAt = expiresAt ? new Date(expiresAt) : null;

    const updatedKey = await prisma.apiKey.update({
      where: { id: params.id },
      data: updateData,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          }
        }
      }
    });

    // Sanitize the key
    const sanitizedKey = {
      ...updatedKey,
      key: `${updatedKey.key.substring(0, 10)}...${updatedKey.key.substring(updatedKey.key.length - 4)}`
    };

    return NextResponse.json(sanitizedKey);
  } catch (error) {
    console.error('Error updating API key:', error);
    return NextResponse.json(
      { error: 'Failed to update API key' },
      { status: 500 }
    );
  }
}

// DELETE - Delete API key
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || session.user.role !== 'admin') {
      return NextResponse.json(
        { error: 'Unauthorized. Admin access required.' },
        { status: 401 }
      );
    }

    await prisma.apiKey.delete({
      where: { id: params.id }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting API key:', error);
    return NextResponse.json(
      { error: 'Failed to delete API key' },
      { status: 500 }
    );
  }
}
