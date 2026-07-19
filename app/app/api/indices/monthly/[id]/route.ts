
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { validateAdminAccess } from '@/lib/role-auth';

export const dynamic = "force-dynamic";

// PUT /api/indices/monthly/[id] - Update a specific monthly index value
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const { authorized, message } = await validateAdminAccess(request);
    if (!authorized) return NextResponse.json({ error: message || 'Admin access required' }, { status: 403 });

    const body = await request.json();
    const { value, isProvisional } = body;
    if (value === undefined || isNaN(parseFloat(value))) {
      return NextResponse.json(
        { error: 'Valid value is required' },
        { status: 400 }
      );
    }

    const updateData: any = { value: parseFloat(value) };
    
    // Update isProvisional if provided
    if (isProvisional !== undefined) {
      updateData.isProvisional = Boolean(isProvisional);
    }

    const updatedValue = await prisma.monthlyIndexValue.update({
      where: { id },
      data: updateData,
      include: {
        priceIndex: true
      }
    });
    
    return NextResponse.json(updatedValue);
  } catch (error: any) {
    console.error('Error updating monthly value:', error);
    
    if (error.code === 'P2025') {
      return NextResponse.json(
        { error: 'Monthly value not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json(
      { error: 'Failed to update monthly value' },
      { status: 500 }
    );
  }
}

// DELETE /api/indices/monthly/[id] - Delete a specific monthly index value
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const { authorized, message } = await validateAdminAccess(request);
    if (!authorized) return NextResponse.json({ error: message || 'Admin access required' }, { status: 403 });

    await prisma.monthlyIndexValue.delete({
      where: { id }
    });
    
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting monthly value:', error);
    
    if (error.code === 'P2025') {
      return NextResponse.json(
        { error: 'Monthly value not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json(
      { error: 'Failed to delete monthly value' },
      { status: 500 }
    );
  }
}
