
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/db';
import { generateMonthlyInvoice } from '@/lib/billing';

export const dynamic = "force-dynamic";

// GET /api/billing/invoices - Get user's invoices
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession();
    
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email }
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    const invoices = await prisma.invoice.findMany({
      where: { userId: user.id },
      include: {
        items: {
          include: {
            billTransaction: {
              include: {
                bill: {
                  include: {
                    contract: true
                  }
                }
              }
            }
          }
        },
        payments: true
      },
      orderBy: { createdAt: 'desc' }
    });

    return NextResponse.json(invoices);
  } catch (error) {
    console.error('Error fetching invoices:', error);
    return NextResponse.json(
      { error: 'Failed to fetch invoices' },
      { status: 500 }
    );
  }
}

// POST /api/billing/invoices/generate - Generate invoice for a month
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession();
    
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email }
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { month, year } = body;

    if (!month || !year) {
      return NextResponse.json(
        { error: 'Month and year are required' },
        { status: 400 }
      );
    }

    const invoiceMonth = new Date(year, month - 1, 1);
    const invoice = await generateMonthlyInvoice(user.id, invoiceMonth);

    if (!invoice) {
      return NextResponse.json(
        { error: 'No billable transactions found for this month' },
        { status: 404 }
      );
    }

    return NextResponse.json(invoice);
  } catch (error) {
    console.error('Error generating invoice:', error);
    return NextResponse.json(
      { error: 'Failed to generate invoice' },
      { status: 500 }
    );
  }
}
