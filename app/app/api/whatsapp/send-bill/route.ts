import { logger } from '@/lib/logger';

/**
 * API endpoint to send bill PDF via WhatsApp using MyDreams API
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { checkUserBillAccess } from '@/lib/permissions';
import { sendBillPDFNotification, isMyDreamsWhatsAppConfigured } from '@/lib/whatsapp-mydreams';
import jwt from 'jsonwebtoken';
import { format } from 'date-fns';
import { getNextAuthSecret } from '@/lib/auth';
import { emailLinkOrigin } from '@/lib/email-link-origin';

export const dynamic = 'force-dynamic';

// Generate a temporary signed token for public PDF access
function generatePDFToken(billId: string, expiresInHours: number = 24): string {
  return jwt.sign(
    { billId },
    getNextAuthSecret(),
    { expiresIn: `${expiresInHours}h` }
  );
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if MyDreams WhatsApp is configured
    const isConfigured = await isMyDreamsWhatsAppConfigured();
    if (!isConfigured) {
      return NextResponse.json(
        { error: 'WhatsApp API not configured. Please contact admin to set up MyDreams credentials.' },
        { status: 500 }
      );
    }

    const { billId, phoneNumber, customerName, templateName, templateParams, templateId } = await req.json();

    if (!billId || !phoneNumber) {
      return NextResponse.json(
        { error: 'Bill ID and phone number are required' },
        { status: 400 }
      );
    }

    // Get bill details
    const bill = await prisma.bill.findUnique({
      where: { id: billId },
      include: {
        contract: {
          include: {
            user: true,
          },
        },
      },
    });

    if (!bill) {
      return NextResponse.json({ error: 'Bill not found' }, { status: 404 });
    }

    // Check if user has access to this bill
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, role: true },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // The same gate the bill pages and PDF routes use: owner, admin, an explicit grant,
    // or a department user whose zone matches and whose bill has been submitted.
    //
    // This used to admit ANY railway official to ANY bill in the country — no zone, no
    // ownership — and the next lines mint a 24-hour public PDF link and send it to a
    // number supplied in the request. That made it a way to pull any contractor's
    // statement out of the app, not merely to read one.
    const access = user ? await checkUserBillAccess(user.id, billId) : null;
    if (!access?.canView) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const billNumber = bill.billNo || 'N/A';
    const pdfFileName = `PVC_Report_${billNumber.replace(/\//g, '_')}.pdf`;
    const recipient = customerName || bill.contract?.contractorName || 'Customer';

    // Generate a signed token for public PDF access (valid for 24 hours)
    const pdfToken = generatePDFToken(billId, 24);
    
    // Use the public endpoint for WhatsApp PDF access
    // This endpoint is simpler and handles the PDF generation internally
    // URL-encode the token to prevent URL parsing issues
    const encodedToken = encodeURIComponent(pdfToken);
    // Built from the canonical origin, never NEXTAUTH_URL: that names the platform
        // host, so contractors received WhatsApp links to a domain that is not the site.
        let pdfUrl = `${emailLinkOrigin()}/api/public/bill-pdf?billId=${billId}&token=${encodedToken}`;
    
    // Add templateId to PDF URL if provided
    if (templateId) {
      pdfUrl += `&templateId=${templateId}`;
    }
    
    logger.log('[WhatsApp] PDF URL generated:', pdfUrl.substring(0, 100) + '...');
    
    // Format all 5 template parameters for 'bill_created_with_pdf' template
    // {{1}} = Customer Name
    // {{2}} = Bill Number
    // {{3}} = Agreement No
    // {{4}} = Measurement Period
    // {{5}} = Bill Amount
    // IMPORTANT: Do NOT use toLocaleString() - commas will break parameter parsing!
    const formattedTemplateParams = templateParams || [
      recipient,
      billNumber,
      bill.contract?.agreementNo || 'N/A',
      bill.dateOfMeasurement ? format(new Date(bill.dateOfMeasurement), 'dd-MMM-yyyy') : 'N/A',
      bill.grossBillAmount ? `₹${bill.grossBillAmount.toFixed(2)}` : 'N/A',
    ];
    
    logger.log('WhatsApp Send Request:', {
      billId,
      billNumber,
      phoneNumber,
      customerName: recipient,
      pdfUrl: pdfUrl.substring(0, 80) + '...', // Log partial URL for security
      pdfFileName,
      template: templateName || 'bill_created_with_pdf',
      templateParams: formattedTemplateParams,
    });

    // Send WhatsApp message with PDF using 'bill_created_with_pdf' template
    const result = await sendBillPDFNotification(
      phoneNumber,
      billNumber,
      pdfUrl,
      recipient,
      pdfFileName,
      templateName || 'bill_created_with_pdf',
      formattedTemplateParams
    );
    
    logger.log('WhatsApp Send Result:', result);

    // Log the WhatsApp message to database
    try {
      await prisma.whatsAppLog.create({
        data: {
          billId: billId,
          userId: user.id,
          phoneNumber: phoneNumber,
          recipientName: recipient,
          template: templateName || 'bill_created_with_pdf',
          parameters: formattedTemplateParams,
          status: result.success ? 'sent' : 'failed',
          messageId: result.messageId || null,
          errorMessage: result.success ? null : (result.error || 'Unknown error'),
          pdfUrl: pdfUrl,
          sentAt: new Date(),
        },
      });
    } catch (logError: any) {
      console.error('Failed to log WhatsApp message:', logError);
      // Don't fail the request if logging fails
    }

    if (result.success) {
      return NextResponse.json({
        message: 'Bill PDF sent successfully via WhatsApp',
        messageId: result.messageId,
        billNumber: billNumber,
      });
    } else {
      return NextResponse.json(
        {
          error: result.error || 'Failed to send WhatsApp message',
        },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error('Send bill WhatsApp error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to send WhatsApp message' },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const configured = await isMyDreamsWhatsAppConfigured();
    
    return NextResponse.json({
      configured,
      provider: 'MyDreams Technology',
      message: configured 
        ? 'WhatsApp integration is configured and ready to send bill PDFs'
        : 'WhatsApp integration is not configured. Please add MyDreams API credentials in admin settings.',
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

