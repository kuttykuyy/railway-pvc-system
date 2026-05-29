
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = "force-dynamic";

// DELETE /api/indices/monthly/bulk-delete - Delete multiple monthly index values
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { ids } = body;
    
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { error: 'Valid array of IDs is required' },
        { status: 400 }
      );
    }

    // Delete multiple records
    const result = await prisma.monthlyIndexValue.deleteMany({
      where: {
        id: {
          in: ids
        }
      }
    });
    
    return NextResponse.json({ 
      success: true, 
      deletedCount: result.count,
      message: `Successfully deleted ${result.count} manual index values`
    });
  } catch (error: any) {
    console.error('Error bulk deleting monthly values:', error);
    
    return NextResponse.json(
      { error: 'Failed to delete monthly values' },
      { status: 500 }
    );
  }
}
