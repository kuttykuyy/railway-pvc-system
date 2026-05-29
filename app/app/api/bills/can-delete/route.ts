import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/db';
import { canUserDeleteBill, canUserDeleteBills } from '@/lib/bill-permissions';

export const dynamic = "force-dynamic";

// POST /api/bills/can-delete - Check if user can delete bills
export async function POST(request: NextRequest) {
  try {
    // Get user session
    const session = await getServerSession();
    
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get user details
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, role: true }
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { billId, billIds } = body;

    // Check single bill
    if (billId) {
      const result = await canUserDeleteBill(user.id, billId, user.role);
      return NextResponse.json(result);
    }

    // Check multiple bills
    if (billIds && Array.isArray(billIds)) {
      const result = await canUserDeleteBills(user.id, billIds, user.role);
      return NextResponse.json(result);
    }

    return NextResponse.json(
      { error: 'Either billId or billIds must be provided' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Error checking bill deletion permission:', error);
    return NextResponse.json(
      { error: 'Failed to check permissions' },
      { status: 500 }
    );
  }
}
