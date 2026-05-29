

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { validateApiAccess } from '@/lib/payment-validation';

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
  try {
    // Validate API access
    const { authorized, user, message: authMessage } = await validateApiAccess(request);
    
    if (!authorized || !user) {
      return NextResponse.json(
        { error: authMessage || 'Unauthorized' },
        { status: 401 }
      );
    }

    // Check if the user is an admin
    if (user.role !== 'admin') {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      );
    }

    const { userId } = params;
    const body = await request.json();
    const { isFreeAccount, customProcessingFee } = body;

    // Validate input
    if (typeof isFreeAccount !== 'boolean') {
      return NextResponse.json(
        { error: 'isFreeAccount must be a boolean' },
        { status: 400 }
      );
    }

    if (customProcessingFee !== null && customProcessingFee !== undefined) {
      const fee = parseFloat(customProcessingFee);
      if (isNaN(fee) || fee < 0) {
        return NextResponse.json(
          { error: 'customProcessingFee must be a positive number or null' },
          { status: 400 }
        );
      }
    }

    // Get the target user
    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true },
    });

    if (!targetUser) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Update the user's processing fee settings
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        isFreeAccount,
        customProcessingFee: isFreeAccount ? null : (customProcessingFee || null),
      },
      select: {
        id: true,
        email: true,
        name: true,
        isFreeAccount: true,
        customProcessingFee: true,
      },
    });

    return NextResponse.json({
      message: 'Processing fee settings updated successfully',
      user: updatedUser,
    });
  } catch (error: any) {
    console.error('Error updating processing fee settings:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
