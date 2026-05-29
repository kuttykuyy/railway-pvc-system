
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Check if user is admin
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user || user.role !== 'admin') {
      return NextResponse.json(
        { error: 'Forbidden - Admin access required' },
        { status: 403 }
      );
    }

    // Get payment method setting
    const setting = await prisma.adminSettings.findUnique({
      where: { key: 'payment_method' },
    });

    return NextResponse.json({
      paymentMethod: setting?.value || 'manual',
      description: setting?.description,
      updatedAt: setting?.updatedAt,
      updatedBy: setting?.updatedByUserEmail,
    });
  } catch (error: any) {
    console.error('Error fetching payment settings:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch settings' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Check if user is admin
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user || user.role !== 'admin') {
      return NextResponse.json(
        { error: 'Forbidden - Admin access required' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { paymentMethod } = body;

    if (!paymentMethod || !['razorpay', 'manual'].includes(paymentMethod)) {
      return NextResponse.json(
        { error: 'Invalid payment method. Must be "razorpay" or "manual"' },
        { status: 400 }
      );
    }

    // Update or create setting
    const setting = await prisma.adminSettings.upsert({
      where: { key: 'payment_method' },
      update: {
        value: paymentMethod,
        updatedByUserId: user.id,
        updatedByUserEmail: user.email,
        updatedAt: new Date(),
      },
      create: {
        key: 'payment_method',
        value: paymentMethod,
        description: 'Payment method for credit top-ups (razorpay or manual)',
        dataType: 'string',
        updatedByUserId: user.id,
        updatedByUserEmail: user.email,
      },
    });

    return NextResponse.json({
      success: true,
      message: `Payment method updated to ${paymentMethod}`,
      setting,
    });
  } catch (error: any) {
    console.error('Error updating payment settings:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update settings' },
      { status: 500 }
    );
  }
}
