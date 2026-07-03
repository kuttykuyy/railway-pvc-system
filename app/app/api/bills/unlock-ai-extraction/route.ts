import { NextResponse } from 'next/server';
import { validateApiAccess } from '@/lib/payment-validation';
import { advancedCache } from '@/lib/advanced-cache';

export const dynamic = 'force-dynamic';

/**
 * DEPRECATED. Extraction results are now returned inline by /api/bills/cement-analysis
 * (always `isUnlocked: true`) and applied directly on the client, so there is no
 * server-side cache to read back here. This handler is retained only for backward
 * compatibility and will report that the result must be re-extracted.
 * AI billing occurs once when the bill is saved.
 */
export async function POST(request: Request) {
  try {
    const { authorized, user, message } = await validateApiAccess(request);

    if (!authorized || !user) {
      return NextResponse.json(
        { error: message || 'Unauthorized' },
        { status: 401 }
      );
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON request body' },
        { status: 400 }
      );
    }

    const { extractionId } = body;
    if (!extractionId || typeof extractionId !== 'string') {
      return NextResponse.json(
        { error: 'extractionId is required' },
        { status: 400 }
      );
    }

    const cachedData = advancedCache.get(`ai-extraction:${extractionId}`);
    if (!cachedData) {
      return NextResponse.json(
        { error: 'AI Extraction result has expired or is invalid. Please upload the PDF again.' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'AI Bill details imported successfully!',
      cost: 0,
      data: cachedData,
    });
  } catch (error) {
    console.error('Error importing AI extraction:', error);
    return NextResponse.json(
      { error: 'Failed to import AI extraction details. Please try again.' },
      { status: 500 }
    );
  }
}
