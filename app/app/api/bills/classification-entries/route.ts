
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { checkUserBillAccess } from '@/lib/permissions';

/**
 * The requester's access to a bill, resolved from the session.
 *
 * Every handler here reads or WRITES a bill's classification entries — the rows the PVC
 * is computed from — and each one checked only that a session existed, never whose bill
 * it was. Any signed-in user could read any bill's breakdown, inject entries into
 * another user's bill, or edit and delete entries by id. Writes require canEdit, reads
 * canView, and the entry-id handlers resolve the entry to its bill first so an id
 * cannot sidestep the check.
 */
async function billAccessFor(email: string, billId: string) {
  const requester = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!requester) return null;
  return checkUserBillAccess(requester.id, billId);
}

// GET - Fetch classification entries for a bill
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const billId = searchParams.get('billId');

    if (!billId) {
      return NextResponse.json({ error: 'Bill ID is required' }, { status: 400 });
    }

    const access = await billAccessFor(session.user.email, billId);
    if (!access?.canView) {
      return NextResponse.json({ error: 'You do not have access to this bill.' }, { status: 403 });
    }

    const entries = await prisma.billClassificationEntry.findMany({
      where: { billId },
      include: {
        classification: {
          select: {
            id: true,
            code: true,
            name: true,
            description: true,
            subClassifications: true,
            fixed: true,
            labour: true,
            steel: true,
            cement: true,
            plantMachinery: true,
            fuel: true,
            otherMaterials: true,
            explosives: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return NextResponse.json(entries);
  } catch (error) {
    console.error('Error fetching classification entries:', error);
    return NextResponse.json(
      { error: 'Failed to fetch classification entries' },
      { status: 500 }
    );
  }
}

// POST - Create a new classification entry
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { billId, classificationId, subClassifications, amount, description } = body;

    if (!billId || !classificationId || !amount) {
      return NextResponse.json(
        { error: 'Bill ID, classification ID, and amount are required' },
        { status: 400 }
      );
    }

    // Verify bill exists and user has access — the old comment claimed this and the
    // code only checked existence.
    const bill = await prisma.bill.findUnique({
      where: { id: billId },
      select: { id: true },
    });
    if (!bill) {
      return NextResponse.json({ error: 'Bill not found' }, { status: 404 });
    }
    const access = await billAccessFor(session.user.email, billId);
    if (!access?.canEdit) {
      return NextResponse.json({ error: 'You do not have access to this bill.' }, { status: 403 });
    }

    // Create the entry
    const entry = await prisma.billClassificationEntry.create({
      data: {
        billId,
        classificationId,
        subClassifications: subClassifications || [],
        amount: parseFloat(amount),
        description,
      },
      include: {
        classification: true,
      },
    });

    return NextResponse.json(entry, { status: 201 });
  } catch (error) {
    console.error('Error creating classification entry:', error);
    return NextResponse.json(
      { error: 'Failed to create classification entry' },
      { status: 500 }
    );
  }
}

// PUT - Update a classification entry
export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { id, subClassifications, amount, description } = body;

    if (!id) {
      return NextResponse.json({ error: 'Entry ID is required' }, { status: 400 });
    }

    const existing = await prisma.billClassificationEntry.findUnique({
      where: { id },
      select: { billId: true },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
    }
    const access = await billAccessFor(session.user.email, existing.billId);
    if (!access?.canEdit) {
      return NextResponse.json({ error: 'You do not have access to this bill.' }, { status: 403 });
    }

    const entry = await prisma.billClassificationEntry.update({
      where: { id },
      data: {
        ...(subClassifications !== undefined && { subClassifications }),
        ...(amount !== undefined && { amount: parseFloat(amount) }),
        ...(description !== undefined && { description }),
      },
      include: {
        classification: true,
      },
    });

    return NextResponse.json(entry);
  } catch (error) {
    console.error('Error updating classification entry:', error);
    return NextResponse.json(
      { error: 'Failed to update classification entry' },
      { status: 500 }
    );
  }
}

// DELETE - Remove a classification entry
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Entry ID is required' }, { status: 400 });
    }

    const existing = await prisma.billClassificationEntry.findUnique({
      where: { id },
      select: { billId: true },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
    }
    const access = await billAccessFor(session.user.email, existing.billId);
    if (!access?.canEdit) {
      return NextResponse.json({ error: 'You do not have access to this bill.' }, { status: 403 });
    }

    await prisma.billClassificationEntry.delete({
      where: { id },
    });

    return NextResponse.json({ message: 'Entry deleted successfully' });
  } catch (error) {
    console.error('Error deleting classification entry:', error);
    return NextResponse.json(
      { error: 'Failed to delete classification entry' },
      { status: 500 }
    );
  }
}
