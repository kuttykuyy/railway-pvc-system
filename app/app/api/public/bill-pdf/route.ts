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

    // Build PDF report URL with all parameters
    let pdfReportUrl = `${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/bills/${billId}/pdf-report?public_access=true&token=${encodeURIComponent(token)}`;
    
    if (templateId) {
      pdfReportUrl += `&templateId=${templateId}`;
    }
    
    logger.log('[Public PDF] Fetching PDF from:', pdfReportUrl.substring(0, 80) + '...');

    try {
      // Fetch the PDF from the internal endpoint with a longer timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 55000); // 55 second timeout
      
      const pdfResponse = await fetch(pdfReportUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'WhatsApp-Public-Access/1.0',
          'X-Public-Access-Token': token,
          'Accept': 'application/pdf',
        },
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      logger.log('[Public PDF] Internal fetch response:', pdfResponse.status, pdfResponse.statusText);

      if (!pdfResponse.ok) {
        const errorText = await pdfResponse.text();
        console.error('[Public PDF] Failed to fetch PDF:', pdfResponse.status, pdfResponse.statusText);
        console.error('[Public PDF] Error body:', errorText.substring(0, 500));
        return NextResponse.json(
          { error: 'Failed to generate PDF: ' + pdfResponse.statusText },
          { status: 500 }
        );
      }

      // Get the PDF as a buffer
      const pdfBuffer = await pdfResponse.arrayBuffer();
      const elapsed = Date.now() - startTime;
      logger.log('[Public PDF] PDF generated successfully, size:', pdfBuffer.byteLength, 'bytes, time:', elapsed, 'ms');

      // Return the PDF with proper headers for WhatsApp
      return new NextResponse(pdfBuffer, {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="PVC_Report_${bill.billNo?.replace(/\//g, '_')}.pdf"`,
          'Content-Length': pdfBuffer.byteLength.toString(),
          'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
          'Accept-Ranges': 'bytes',
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
        { error: 'Failed to fetch PDF: ' + fetchError.message },
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

