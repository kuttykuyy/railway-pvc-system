
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { generateGstInvoiceHtml } from '@/lib/gst-invoice-html';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/gst-invoices/[id]/pdf
 * Admin endpoint for GST invoice PDF
 * Requires admin authentication
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    // Check admin authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const adminUser = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!adminUser || adminUser.role !== 'admin') {
      return NextResponse.json(
        { error: 'Unauthorized - Admin access required' },
        { status: 403 }
      );
    }

    // Get invoice
    const invoice = await prisma.gstInvoice.findUnique({
      where: { id: id },
    });

    if (!invoice) {
      return NextResponse.json(
        { error: 'Invoice not found' },
        { status: 404 }
      );
    }

    // Get user details
    const user = await prisma.user.findUnique({
      where: { id: invoice.userId },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Generate PDF HTML
    const html = generateGstInvoiceHtml(invoice, user);

    // Return HTML that can be printed as PDF
    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html',
        'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
      },
    });
  } catch (error: any) {
    console.error('Error generating public GST invoice PDF:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate PDF' },
      { status: 500 }
    );
  }
}

