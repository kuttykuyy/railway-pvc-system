
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getUserGstInvoices } from '@/lib/gst-invoice';

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get user by email first
    const { prisma } = await import('@/lib/db');
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    const invoices = await getUserGstInvoices(user.id);

    return NextResponse.json({ invoices });
  } catch (error: any) {
    console.error('Error fetching GST invoices:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch invoices' },
      { status: 500 }
    );
  }
}
