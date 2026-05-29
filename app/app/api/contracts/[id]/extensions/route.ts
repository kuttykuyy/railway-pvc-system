
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';

// GET - Fetch all extensions for a contract
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const extensions = await prisma.contractExtension.findMany({
      where: {
        contractId: params.id
      },
      orderBy: {
        approvalDate: 'desc'
      }
    });

    return NextResponse.json({ extensions });
  } catch (error) {
    console.error('Error fetching extensions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch extensions' },
      { status: 500 }
    );
  }
}

// POST - Create a new extension
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const data = await request.json();
    
    // Validate required fields
    if (!data.extensionType || !data.originalCompletionDate || !data.extendedCompletionDate) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Calculate extension duration in days
    const originalDate = new Date(data.originalCompletionDate);
    const extendedDate = new Date(data.extendedCompletionDate);
    const extensionDuration = Math.ceil((extendedDate.getTime() - originalDate.getTime()) / (1000 * 60 * 60 * 24));

    // For 17B extensions, set PVC restriction date as original completion date
    const isPvcRestricted = data.extensionType === '17B';
    const pvcRestrictionDate = isPvcRestricted ? originalDate : null;

    // Create the extension
    const extension = await prisma.contractExtension.create({
      data: {
        contractId: params.id,
        extensionType: data.extensionType,
        extensionSubcategory: data.extensionSubcategory || null,
        extensionReason: data.extensionReason || null,
        originalCompletionDate: originalDate,
        extendedCompletionDate: extendedDate,
        extensionDuration,
        isPvcRestricted,
        pvcRestrictionDate,
        approvedBy: data.approvedBy || null,
        approvalDate: data.approvalDate ? new Date(data.approvalDate) : new Date(),
        orderNumber: data.orderNumber || null,
        liquidatedDamagesRate: data.liquidatedDamagesRate || null,
        isLiquidatedDamages: data.extensionType === '17B'
      }
    });

    // Update the contract with latest extension details
    await prisma.contract.update({
      where: { id: params.id },
      data: {
        currentCompletionDate: extendedDate,
        extensionType: data.extensionType,
        extensionReason: data.extensionReason || null,
        extensionGrantedDate: new Date(),
        isExtended: true
      }
    });

    return NextResponse.json({ extension }, { status: 201 });
  } catch (error) {
    console.error('Error creating extension:', error);
    return NextResponse.json(
      { error: 'Failed to create extension' },
      { status: 500 }
    );
  }
}
