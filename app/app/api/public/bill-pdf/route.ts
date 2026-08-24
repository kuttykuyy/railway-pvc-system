import { logger } from '@/lib/logger';

/**
 * Public API endpoint for accessing bill PDFs via WhatsApp
 * Uses token-based authentication for security
 * 
 * This endpoint is specifically designed for WhatsApp integration where
 * external servers need to download the PDF without user authentication
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import jwt from 'jsonwebtoken';
import { getNextAuthSecret } from '@/lib/auth';
import { emailLinkOrigin } from '@/lib/email-link-origin';
import { looksLikePdf, describeNonPdf } from '@/lib/pdf-bytes';

export const dynamic = 'force-dynamic';

// Increase timeout for PDF generation - WhatsApp servers may have stricter timeouts
export const maxDuration = 60; // 60 seconds max

export async function GET(req: NextRequest) {
  const startTime = Date.now();
  logger.log('[Public PDF] Request received at:', new Date().toISOString());
  
  try {
    const searchParams = req.nextUrl.searchParams;
    const token = searchParams.get('token');
    const billId = searchParams.get('billId');
    const templateId = searchParams.get('templateId');

    logger.log('[Public PDF] Params - billId:', billId, 'token:', token ? 'present' : 'missing', 'templateId:', templateId);

    if (!token || !billId) {
      console.error('[Public PDF] Missing token or billId');
      return NextResponse.json(
        { error: 'Missing token or billId parameter' },
        { status: 400 }
      );
    }

    // Verify the token
    try {
      const decoded = jwt.verify(token, getNextAuthSecret()) as { billId: string; exp: number };
      
      // Check if the token is for this bill
      if (decoded.billId !== billId) {
        console.error('[Public PDF] Token billId mismatch:', decoded.billId, '!=', billId);
        return NextResponse.json(
          { error: 'Invalid token for this bill' },
          { status: 403 }
        );
      }
      logger.log('[Public PDF] Token verified successfully, expires:', new Date(decoded.exp * 1000).toISOString());
    } catch (error: any) {
      console.error('[Public PDF] Token verification failed:', error.message);
      return NextResponse.json(
        { error: 'Invalid or expired token' },
        { status: 403 }
      );
    }

    // Fetch the bill to verify it exists
    const bill = await prisma.bill.findUnique({
      where: { id: billId },
    });

    if (!bill) {
      console.error('[Public PDF] Bill not found:', billId);
      return NextResponse.json({ error: 'Bill not found' }, { status: 404 });
    }
    
    logger.log('[Public PDF] Bill found:', bill.billNo);

    // The request the report handler will read its options from. It never goes over the
    // network (see below) — the URL exists because a NextRequest needs an absolute one,
    // and the canonical origin is the honest thing to put there.
    //
    // format matters. Nothing asked for one, so the report route fell through to its
    // 'detailed' default. Every other download in the app asks for ir_standard — the
    // bill list, the bill form, the full report page. The one PDF a contractor actually
    // receives was the only one in the product that was not the IR statement.
    const format = searchParams.get('format') || 'ir_standard';
    let pdfReportUrl = `${emailLinkOrigin()}/api/bills/${billId}/pdf-report`
      + `?public_access=true&format=${encodeURIComponent(format)}&token=${encodeURIComponent(token)}`;

    if (templateId) {
      pdfReportUrl += `&templateId=${encodeURIComponent(templateId)}`;
    }
    
    logger.log('[Public PDF] Generating report for:', billId, 'format:', format);

    try {
      // The report handler is CALLED, not fetched over HTTP.
      //
      // This route used to make a real network request back to the app's own domain for
      // /api/bills/<id>/pdf-report. That request carries no session cookie, and
      // pdf-report is not in middleware.ts's list of paths that may reach their handler
      // unauthenticated — so the middleware answered it with a 307 to /auth/signin,
      // fetch followed the redirect, and the sign-in PAGE came back with status 200.
      // Those bytes were then served to WhatsApp as application/pdf. That is the whole
      // story of the corrupted attachment: the contractor was sent the login page.
      //
      // The middleware is right to bounce it — nothing about that request proves who it
      // is until the handler checks the token — so the fix is not to punch a hole in the
      // middleware but to stop leaving the process at all. The handler is an ordinary
      // async function; calling it directly keeps its own public_access token check
      // (which is the real gate), and drops a network round trip and a second cold start
      // from a request already budgeted at sixty seconds.
      const { GET: generateReport } = await import('@/app/api/bills/[id]/pdf-report/route');
      const pdfResponse = await generateReport(
        new NextRequest(pdfReportUrl, {
          headers: {
            'User-Agent': 'WhatsApp-Public-Access/1.0',
            'X-Public-Access-Token': token,
            'Accept': 'application/pdf',
          },
        }),
        { params: Promise.resolve({ id: billId }) },
      );

      logger.log('[Public PDF] Report handler responded:', pdfResponse.status);

      if (!pdfResponse.ok) {
        const errorText = await pdfResponse.text();
        console.error('[Public PDF] The report could not be generated:', pdfResponse.status);
        console.error('[Public PDF] Error body:', errorText.substring(0, 500));
        return NextResponse.json(
          { error: 'Failed to generate PDF' },
          { status: 500 }
        );
      }

      // Get the PDF as a buffer
      const pdfBuffer = await pdfResponse.arrayBuffer();
      const elapsed = Date.now() - startTime;

      // Is it actually a PDF? Every PDF begins "%PDF-". A 200 carrying an HTML error
      // page was being relabelled application/pdf and handed to WhatsApp, which is a
      // file that downloads and will not open — and nothing anywhere said so. Better a
      // failure the log names than an attachment the contractor cannot read.
      if (!looksLikePdf(pdfBuffer)) {
        console.error('[Public PDF] The report endpoint did not return a PDF.',
          'bytes:', pdfBuffer.byteLength, 'got:', describeNonPdf(pdfBuffer));
        return NextResponse.json(
          { error: 'The report could not be generated as a PDF.' },
          { status: 502 },
        );
      }

      logger.log('[Public PDF] PDF generated successfully, size:', pdfBuffer.byteLength, 'bytes, time:', elapsed, 'ms');

      // Return the PDF with proper headers for WhatsApp.
      //
      // No Content-Length and no Accept-Ranges, both deliberately. The length was set by
      // hand from the buffer, which is wrong the moment the platform compresses the
      // response — a declared length that disagrees with the bytes on the wire is a
      // truncated download. Accept-Ranges promised range support this route does not
      // implement, so a client that took it up got whatever it made of a full body
      // answering a partial request. Letting the platform frame its own response is the
      // fix for both.
      //
      // Cache-Control is private: this is one contractor's bill behind a signed token,
      // and it has no business sitting in a shared cache for an hour.
      return new NextResponse(pdfBuffer, {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="PVC_Report_${bill.billNo?.replace(/\//g, '_')}.pdf"`,
          'Cache-Control': 'private, no-store',
          'X-Generation-Time-Ms': elapsed.toString(),
        },
      });
    } catch (fetchError: any) {
      const elapsed = Date.now() - startTime;
      console.error('[Public PDF] Error fetching PDF after', elapsed, 'ms:', fetchError.message);
      
      if (fetchError.name === 'AbortError') {
        return NextResponse.json(
          { error: 'PDF generation timed out. Please try again.' },
          { status: 504 }
        );
      }
      
      return NextResponse.json(
        { error: 'Failed to generate PDF: ' + fetchError.message },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error('[Public PDF] Unexpected error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

