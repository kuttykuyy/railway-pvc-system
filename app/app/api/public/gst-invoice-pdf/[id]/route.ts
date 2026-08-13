
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import jwt from 'jsonwebtoken';
import { prisma } from '@/lib/db';
import { authOptions, getNextAuthSecret } from '@/lib/auth';
import { generateGstInvoiceHtml } from '@/lib/gst-invoice-html';

export const dynamic = 'force-dynamic';

/**
 * GET /api/public/gst-invoice-pdf/[id]?token=<jwt>
 * Serves a GST invoice PDF. Access requires EITHER:
 *  - a valid signed token scoped to this invoice id (used for WhatsApp-shared links), OR
 *  - an authenticated session belonging to the invoice owner (or an admin).
 * The invoice contains customer PII and financial data, so the bare id is not sufficient.
 */
async function isAuthorized(request: NextRequest, invoice: { id: string; userId: string }): Promise<boolean> {
  // 1) Signed token in the URL (WhatsApp / email share links).
  const token = new URL(request.url).searchParams.get('token');
  if (token) {
    try {
      const decoded = jwt.verify(token, getNextAuthSecret()) as { invoiceId?: string };
      if (decoded.invoiceId === invoice.id) return true;
    } catch {
      // fall through to session check
    }
  }

  // 2) Authenticated owner or admin.
  const session = await getServerSession(authOptions);
  if (session?.user?.email) {
    const requester = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, role: true },
    });
    if (requester) {
      if (requester.id === invoice.userId) return true;
      if (requester.role === 'admin' || requester.role === 'superadmin') return true;
    }
  }
  return false;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
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

    if (!(await isAuthorized(request, invoice))) {
      return NextResponse.json(
        { error: 'Not authorized to view this invoice' },
        { status: 403 }
      );
    }

    // Get user details — only what the invoice template actually reads. The bare
    // findUnique pulled the whole row (password hash, reset token, login IP) into a
    // handler on a token-authorized public route; nothing leaked only because the
    // template never dereferenced them, which is one template edit away from a leak.
    const user = await prisma.user.findUnique({
      where: { id: invoice.userId },
      select: { id: true, name: true, email: true, companyName: true, gstin: true, phone: true },
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
        // Contains customer PII — never cache on shared/CDN layers.
        'Cache-Control': 'private, no-store',
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

