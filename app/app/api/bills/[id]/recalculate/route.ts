
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { checkUserBillAccess } from '@/lib/permissions';
import {
  recalculateBillPvc,
  BillNotFoundError,
  NoClassificationError,
} from '@/lib/recalculate-bill-pvc';

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const billId = id;

    // Ownership: recalculation mutates the bill + its PVC, so the caller must own it
    // (or be an admin). Without this any logged-in user could recalc another's bill.
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    const requester = await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } });
    const access = requester ? await checkUserBillAccess(requester.id, billId) : null;
    if (!access?.canEdit) {
      return NextResponse.json({ error: 'You do not have access to this bill.' }, { status: 403 });
    }

    // The calculation itself lives in lib/recalculate-bill-pvc so that a cron or a bulk
    // fix runs exactly the same code rather than a second copy of it.
    const result = await recalculateBillPvc(billId);

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof BillNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof NoClassificationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('Error recalculating PVC:', error);
    return NextResponse.json(
      { error: 'Failed to recalculate PVC' },
      { status: 500 }
    );
  }
}
