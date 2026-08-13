
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';

// GET - Fetch a specific extension
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; extensionId: string }> }
) {
  const { id, extensionId } = await params;
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Ownership on the contract, and the extension must BELONG to that contract - the
    // handlers took any extensionId with no ownership check and never used the contract
    // param at all.
    const requester = session.user?.email
      ? await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } })
      : null;
    const { checkUserContractAccess } = await import('@/lib/permissions');
    const access = requester ? await checkUserContractAccess(requester.id, id) : null;
    if (!access?.canView) {
      return NextResponse.json({ error: 'You do not have access to this contract.' }, { status: 403 });
    }
    const belongs = await prisma.contractExtension.findFirst({
      where: { id: extensionId, contractId: id },
      select: { id: true },
    });
    if (!belongs) {
      return NextResponse.json({ error: 'Extension not found' }, { status: 404 });
    }

    const extension = await prisma.contractExtension.findUnique({
      where: {
        id: extensionId
      },
      include: {
        contract: true
      }
    });

    if (!extension) {
      return NextResponse.json({ error: 'Extension not found' }, { status: 404 });
    }

    return NextResponse.json({ extension });
  } catch (error) {
    console.error('Error fetching extension:', error);
    return NextResponse.json(
      { error: 'Failed to fetch extension' },
      { status: 500 }
    );
  }
}

// PATCH - Update an extension
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; extensionId: string }> }
) {
  const { id, extensionId } = await params;
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Ownership on the contract, and the extension must BELONG to that contract - the
    // handlers took any extensionId with no ownership check and never used the contract
    // param at all.
    const requester = session.user?.email
      ? await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } })
      : null;
    const { checkUserContractAccess } = await import('@/lib/permissions');
    const access = requester ? await checkUserContractAccess(requester.id, id) : null;
    if (!access?.canEdit) {
      return NextResponse.json({ error: 'You do not have access to this contract.' }, { status: 403 });
    }
    const belongs = await prisma.contractExtension.findFirst({
      where: { id: extensionId, contractId: id },
      select: { id: true },
    });
    if (!belongs) {
      return NextResponse.json({ error: 'Extension not found' }, { status: 404 });
    }

    const data = await request.json();

    // If dates are updated, recalculate duration
    let extensionDuration;
    if (data.originalCompletionDate && data.extendedCompletionDate) {
      const originalDate = new Date(data.originalCompletionDate);
      const extendedDate = new Date(data.extendedCompletionDate);
      extensionDuration = Math.ceil((extendedDate.getTime() - originalDate.getTime()) / (1000 * 60 * 60 * 24));
    }

    const updateData: any = {
      ...data,
      extensionDuration,
      updatedAt: new Date()
    };

    // Handle date conversions
    if (data.originalCompletionDate) {
      updateData.originalCompletionDate = new Date(data.originalCompletionDate);
    }
    if (data.extendedCompletionDate) {
      updateData.extendedCompletionDate = new Date(data.extendedCompletionDate);
    }
    if (data.approvalDate) {
      updateData.approvalDate = new Date(data.approvalDate);
    }
    if (data.pvcRestrictionDate) {
      updateData.pvcRestrictionDate = new Date(data.pvcRestrictionDate);
    }

    const extension = await prisma.contractExtension.update({
      where: {
        id: extensionId
      },
      data: updateData
    });

    // Update contract if this is the latest extension
    if (data.extendedCompletionDate) {
      await prisma.contract.update({
        where: { id: id },
        data: {
          currentCompletionDate: new Date(data.extendedCompletionDate),
          extensionType: data.extensionType || extension.extensionType,
          extensionReason: data.extensionReason || extension.extensionReason,
          extensionGrantedDate: new Date()
        }
      });
    }

    return NextResponse.json({ extension });
  } catch (error) {
    console.error('Error updating extension:', error);
    return NextResponse.json(
      { error: 'Failed to update extension' },
      { status: 500 }
    );
  }
}

// DELETE - Delete an extension
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; extensionId: string }> }
) {
  const { id, extensionId } = await params;
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Ownership on the contract, and the extension must BELONG to that contract - the
    // handlers took any extensionId with no ownership check and never used the contract
    // param at all.
    const requester = session.user?.email
      ? await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } })
      : null;
    const { checkUserContractAccess } = await import('@/lib/permissions');
    const access = requester ? await checkUserContractAccess(requester.id, id) : null;
    if (!access?.canEdit) {
      return NextResponse.json({ error: 'You do not have access to this contract.' }, { status: 403 });
    }
    const belongs = await prisma.contractExtension.findFirst({
      where: { id: extensionId, contractId: id },
      select: { id: true },
    });
    if (!belongs) {
      return NextResponse.json({ error: 'Extension not found' }, { status: 404 });
    }

    await prisma.contractExtension.delete({
      where: {
        id: extensionId
      }
    });

    // Check if there are remaining extensions and update contract accordingly
    const remainingExtensions = await prisma.contractExtension.findMany({
      where: { contractId: id },
      orderBy: { approvalDate: 'desc' },
      take: 1
    });

    if (remainingExtensions.length > 0) {
      const latestExtension = remainingExtensions[0];
      await prisma.contract.update({
        where: { id: id },
        data: {
          currentCompletionDate: latestExtension.extendedCompletionDate,
          extensionType: latestExtension.extensionType,
          extensionReason: latestExtension.extensionReason,
          extensionGrantedDate: latestExtension.approvalDate
        }
      });
    } else {
      // No more extensions, reset contract to original state
      const contract = await prisma.contract.findUnique({
        where: { id: id }
      });
      
      await prisma.contract.update({
        where: { id: id },
        data: {
          currentCompletionDate: contract?.originalCompletionDate,
          extensionType: null,
          extensionReason: null,
          extensionGrantedDate: null,
          isExtended: false
        }
      });
    }

    return NextResponse.json({ message: 'Extension deleted successfully' });
  } catch (error) {
    console.error('Error deleting extension:', error);
    return NextResponse.json(
      { error: 'Failed to delete extension' },
      { status: 500 }
    );
  }
}
