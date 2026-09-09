import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import rateLimiter, { RATE_LIMITS, getIdentifier } from '@/lib/rate-limiter';
import { isDoclingConfigured, startDoclingJob } from '@/lib/ocr/docling';

export const dynamic = 'force-dynamic';
// Starting a job is quick (it just hands the file to Docling and returns an id);
// the slow OCR runs on the Docling host and is polled via GET /api/ocr/[jobId].
export const maxDuration = 60;

/**
 * POST /api/ocr/start — hand a scanned LOA/agreement PDF to the Docling OCR
 * service and return a job id. The browser polls GET /api/ocr/[jobId] until the
 * read is done, then feeds the text to the agreement extractor.
 *
 * Auth + rate-limit mirror /api/contracts/extract-agreement: signed-in only, and
 * keyed on the user (not a spoofable IP) so the AI-cost limit can't be reset.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    if (!isDoclingConfigured()) {
      return NextResponse.json({ error: 'Scanned-PDF reading is not enabled.', configured: false }, { status: 503 });
    }

    const rl = rateLimiter.check(getIdentifier(request, session.user.email), RATE_LIMITS.EXPENSIVE.limit, RATE_LIMITS.EXPENSIVE.windowMs);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: `Too many requests. Please wait ${Math.ceil(rl.resetIn / 1000)}s and try again.` },
        { status: 429, headers: { 'Retry-After': Math.ceil(rl.resetIn / 1000).toString() } },
      );
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }
    if (file.type !== 'application/pdf') {
      return NextResponse.json({ error: 'Please upload the LOA (or agreement) as a PDF.' }, { status: 400 });
    }
    if (file.size > 100 * 1024 * 1024) {
      return NextResponse.json({ error: 'File too large. Maximum size is 100MB.' }, { status: 400 });
    }

    // OCR only the first pages of a scanned LOA/agreement — its fields all sit on the
    // opening page, so reading a whole 30-page scan just wastes minutes. Default 2.
    const maxPagesRaw = parseInt(String(formData.get('maxPages') || ''), 10);
    const maxPages = Number.isFinite(maxPagesRaw) && maxPagesRaw > 0 ? maxPagesRaw : 2;
    const buffer = Buffer.from(await file.arrayBuffer());
    const controller = new AbortController();
    const abortTimer = setTimeout(() => controller.abort(), 45_000);
    try {
      const jobId = await startDoclingJob(buffer, file.name || 'loa.pdf', { signal: controller.signal, maxPages });
      return NextResponse.json({ jobId, status: 'queued' });
    } finally {
      clearTimeout(abortTimer);
    }
  } catch (error) {
    console.error('[OCR start] failed:', error instanceof Error ? error.message : String(error));
    return NextResponse.json(
      { error: 'Could not start reading the scanned PDF. Please try again.' },
      { status: 502 },
    );
  }
}
