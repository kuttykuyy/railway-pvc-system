import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import rateLimiter, { RATE_LIMITS, getIdentifier } from '@/lib/rate-limiter';
import { extractAgreementFromPdf } from '@/lib/ai/agreement-extractor';

export const dynamic = 'force-dynamic';

/**
 * Reads an uploaded railway agreement PDF and returns the fields needed to
 * pre-fill the "create contract" form. Free feature, but auth-gated + rate
 * limited so it can't be used anonymously to burn the AI key.
 *
 * Base-month rule: the PVC base month is the month BEFORE the tender closing
 * date. The app derives baseMonth server-side as (dateOfOpening - 1 month), so
 * we map the extracted closing date onto `dateOfOpening` to get the right base
 * month automatically.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    // Key on the authenticated user, not the (spoofable) X-Forwarded-For IP, so the
    // AI-cost limit can't be reset by rotating headers.
    const rl = rateLimiter.check(getIdentifier(request, session.user.email), RATE_LIMITS.EXPENSIVE.limit, RATE_LIMITS.EXPENSIVE.windowMs);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: `Too many requests. Please wait ${Math.ceil(rl.resetIn / 1000)}s and try again.` },
        { status: 429, headers: { 'Retry-After': Math.ceil(rl.resetIn / 1000).toString() } },
      );
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }
    if (file.type !== 'application/pdf') {
      return NextResponse.json({ error: 'Please upload the LOA (or agreement) as a PDF.' }, { status: 400 });
    }
    if (file.size > 100 * 1024 * 1024) {
      return NextResponse.json({ error: 'File too large. Maximum size is 100MB.' }, { status: 400 });
    }

    const original = Buffer.from(await file.arrayBuffer());
    const result = await extractAgreementFromPdf(original, file.name);
    if (!result.ok) {
      // Kept and reported exactly as a bill that could not be read is: the PDF, the
      // exact error, who hit it, and a Telegram ping to the admin. LOA failures used to
      // leave only a toast on the user's screen — three in one morning, and nobody knew.
      // Client-side mistakes (not a PDF, too large) are handled above and never get here.
      const { recordParseFailure } = await import('@/lib/parse-failure');
      await recordParseFailure({
        kind: 'agreement',
        userEmail: session.user.email || null,
        fileName: file.name || null,
        error: `${result.error || 'read failed'}${result.detail ? ` — ${result.detail}` : ''}`,
        pdfBuffer: original,
      });
      return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });
    }

    // Keep the LOA for 90 days and hand back its id, so the contract this becomes can
    // carry the document it was read from. Best effort: a storage failure returns null
    // and the extraction is unaffected.
    const { storeUploadedDocument } = await import('@/lib/uploaded-documents');
    const documentId = await storeUploadedDocument({
      kind: 'agreement',
      buffer: original,
      fileName: file.name,
      userId: (session.user as any)?.id || null,
      userEmail: session.user.email || null,
    });

    return NextResponse.json({ data: result.data, documentId, warnings: result.warnings ?? [] });
  } catch (error) {
    console.error('extract-agreement error:', error);
    try {
      const { recordParseFailure } = await import('@/lib/parse-failure');
      await recordParseFailure({
        kind: 'agreement',
        userEmail: null,
        fileName: null,
        error: `UNHANDLED — ${error instanceof Error ? error.message : String(error)}`,
        pdfBuffer: null,
      });
    } catch { /* the failure is already being reported */ }
    return NextResponse.json({ error: 'Failed to read the agreement.' }, { status: 500 });
  }
}
