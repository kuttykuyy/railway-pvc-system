import { NextRequest, NextResponse } from 'next/server';
import { validateAdminAccess } from '@/lib/role-auth';
import {
  getLatestPPACPdfUrl,
  downloadPPACPdf,
  extractFuelPricesWithAI,
  importFuelPricesToDatabase,
  fetchAndImportPPACPrices,
} from '@/lib/ppac-fetcher';

export const dynamic = "force-dynamic";
export const maxDuration = 120; // Allow up to 120s for PDF processing

/**
 * GET - Preview the latest PPAC PDF info (check what's available)
 */
export async function GET(request: NextRequest) {
  try {
    const adminCheck = await validateAdminAccess(request);
    if (!adminCheck.authorized) {
      return NextResponse.json(
        { success: false, error: 'Admin access required' },
        { status: 403 }
      );
    }

    // Just get PDF info without downloading
    const pdfInfo = await getLatestPPACPdfUrl();
    
    if (!pdfInfo) {
      return NextResponse.json({
        success: false,
        error: 'Could not find PPAC PDF on the website',
      });
    }

    return NextResponse.json({
      success: true,
      pdfInfo,
      message: 'Latest PPAC PDF found. Use POST to fetch and import.',
    });
  } catch (error: any) {
    console.error('[PPAC Fetch API] GET error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to check PPAC' },
      { status: 500 }
    );
  }
}

/**
 * POST - Fetch latest PPAC PDF and import diesel prices
 */
export async function POST(request: NextRequest) {
  try {
    const adminCheck = await validateAdminAccess(request);
    if (!adminCheck.authorized) {
      return NextResponse.json(
        { success: false, error: 'Admin access required' },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const { previewOnly = false } = body;

    // Step 1: Get PDF info
    const pdfInfo = await getLatestPPACPdfUrl();
    if (!pdfInfo) {
      return NextResponse.json({
        success: false,
        error: 'Could not find PPAC PDF on the website',
      });
    }

    // Step 2: Download PDF
    const base64 = await downloadPPACPdf(pdfInfo.url);

    // Step 3: Extract prices with AI
    const prices = await extractFuelPricesWithAI(base64);

    if (prices.length === 0) {
      return NextResponse.json({
        success: false,
        pdfInfo,
        error: 'No prices extracted from PDF',
      });
    }

    // If preview only, return extracted prices without importing
    if (previewOnly) {
      return NextResponse.json({
        success: true,
        pdfInfo,
        prices,
        count: prices.length,
        message: 'Preview mode - use previewOnly: false to import',
      });
    }

    // Step 4: Import to database
    const result = await importFuelPricesToDatabase(prices);

    return NextResponse.json({
      success: true,
      pdfInfo,
      extracted: prices.length,
      ...result,
      message: `Import complete: ${result.created} new, ${result.updated} updated, ${result.errors} errors`,
    });
  } catch (error: any) {
    console.error('[PPAC Fetch API] POST error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch from PPAC' },
      { status: 500 }
    );
  }
}
