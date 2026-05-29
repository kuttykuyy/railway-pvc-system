
/**
 * API endpoint to update user phone number
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { validatePhoneNumber } from '@/lib/whatsapp-mydreams';

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { phone } = await req.json();

    // Validate phone number format if provided
    if (phone && !validatePhoneNumber(phone)) {
      return NextResponse.json(
        { error: 'Invalid phone number format. Use format: +[country code][number] (e.g., +919876543210)' },
        { status: 400 }
      );
    }

    // Update user phone number
    const updatedUser = await prisma.user.update({
      where: { email: session.user.email },
      data: { phone: phone || null },
      select: {
        id: true,
        phone: true,
        name: true,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Phone number updated successfully',
      phone: updatedUser.phone,
    });
  } catch (error: any) {
    console.error('Error updating phone number:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update phone number' },
      { status: 500 }
    );
  }
}
