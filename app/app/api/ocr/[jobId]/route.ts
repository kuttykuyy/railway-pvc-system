import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { getDoclingJob, doclingResultToText, isDoclingConfigured } from '@/lib/ocr/docling';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/ocr/[jobId] — poll a Docling OCR job started via POST /api/ocr/start.
 *
 * While running: { status: 'queued' | 'processing' }.
 * When finished: { status: 'done', text, numTables, elapsedSec } — `text` is the
 * document as markdown, ready to feed the agreement extractor.
 * On failure:    { status: 'error', error }.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ jobId: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    if (!isDoclingConfigured()) {
      return NextResponse.json({ status: 'error', error: 'Scanned-PDF reading is not enabled.' }, { status: 503 });
    }

    const { jobId } = await context.params;
    if (!jobId) {
      return NextResponse.json({ error: 'Missing job id' }, { status: 400 });
    }

    const job = await getDoclingJob(jobId);
    if (job.status === 'done' && job.result) {
      return NextResponse.json({
        status: 'done',
        text: doclingResultToText(job.result),
        numTables: job.result.num_tables,
        elapsedSec: job.result.elapsed_sec,
      });
    }
    if (job.status === 'error') {
      return NextResponse.json({ status: 'error', error: job.error || 'The scan could not be read.' });
    }
    return NextResponse.json({ status: job.status });
  } catch (error) {
    console.error('[OCR poll] failed:', error instanceof Error ? error.message : String(error));
    return NextResponse.json(
      { status: 'error', error: 'Could not check the scan status. Please try again.' },
      { status: 502 },
    );
  }
}
