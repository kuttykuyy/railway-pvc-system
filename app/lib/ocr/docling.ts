/**
 * Client for the self-hosted Docling OCR microservice (shared with PrimeRP).
 *
 * Docling reads a *scanned* railway LOA/agreement that has no text layer and
 * returns its text, so the agreement extractor can read clean text instead of a
 * vision model guessing at a blurry page image. Server-only (called from API
 * routes); never import it into a client component.
 *
 * A scan takes minutes on a CPU host — longer than a Vercel request may run — so
 * the service is asynchronous: start a job, then poll it. These are the low-level
 * calls the /api/ocr proxy routes use. An absent service is "not configured", and
 * callers fall back to the vision model rather than erroring.
 */

const RAW_URL = process.env.DOCLING_SERVICE_URL?.trim() || '';
const BASE_URL = RAW_URL.replace(/\/+$/, '');
const API_KEY = process.env.DOCLING_API_KEY?.trim() || '';

/** True only when a base URL is configured; the service can still be down. */
export function isDoclingConfigured(): boolean {
  return BASE_URL.length > 0;
}

export interface DoclingTable {
  index: number;
  num_rows: number;
  num_cols: number;
  rows: string[][];
  markdown: string;
}

export interface DoclingResult {
  filename: string;
  num_tables: number;
  tables: DoclingTable[];
  markdown: string;
  elapsed_sec: number;
}

export type DoclingJobStatus = 'queued' | 'processing' | 'done' | 'error';

export interface DoclingJob {
  status: DoclingJobStatus;
  result?: DoclingResult;
  error?: string;
}

function authHeaders(): Record<string, string> {
  return API_KEY ? { 'X-API-Key': API_KEY } : {};
}

/** Start an async OCR job. Returns the job id to poll. Throws on transport or
 * non-2xx; gate on isDoclingConfigured() first. */
export async function startDoclingJob(
  buffer: Buffer,
  filename: string,
  opts: { signal?: AbortSignal; maxPages?: number } = {},
): Promise<string> {
  if (!isDoclingConfigured()) throw new Error('Docling service is not configured');
  const form = new FormData();
  const bytes = new Uint8Array(buffer);
  form.append('file', new Blob([bytes], { type: 'application/pdf' }), filename || 'upload.pdf');
  // OCR only the first N pages when asked — the LOA's fields are on the opening pages,
  // and OCR cost is per page, so this is the biggest speed win for a long scan.
  if (opts.maxPages && opts.maxPages > 0) form.append('max_pages', String(Math.floor(opts.maxPages)));

  const res = await fetch(`${BASE_URL}/jobs`, {
    method: 'POST',
    headers: authHeaders(),
    body: form,
    signal: opts.signal,
  });
  if (!res.ok) {
    await res.text().catch(() => '');
    throw new Error(`Docling /jobs failed (${res.status})`);
  }
  const data = (await res.json()) as { job_id?: string };
  if (!data.job_id) throw new Error('Docling /jobs returned no job_id');
  return data.job_id;
}

/** Poll one job. Throws only on transport / non-2xx; an errored *job* returns
 * { status: 'error', error }. */
export async function getDoclingJob(
  jobId: string,
  opts: { signal?: AbortSignal } = {},
): Promise<DoclingJob> {
  if (!isDoclingConfigured()) throw new Error('Docling service is not configured');
  const res = await fetch(`${BASE_URL}/jobs/${encodeURIComponent(jobId)}`, {
    method: 'GET',
    headers: authHeaders(),
    signal: opts.signal,
  });
  // The service keeps jobs in memory, so a restart (or a different replica) no longer
  // knows a job it once accepted and answers 404. That is recoverable — the caller can
  // resubmit — so surface it as a distinct job error, not a thrown transport failure
  // (which the poller would retry uselessly until its 15-minute deadline).
  if (res.status === 404) {
    return { status: 'error', error: 'JOB_NOT_FOUND' };
  }
  if (!res.ok) {
    await res.text().catch(() => '');
    throw new Error(`Docling job poll failed (${res.status})`);
  }
  return (await res.json()) as DoclingJob;
}

/**
 * Flatten a Docling result into one text block for the agreement extractor.
 * Prefers the whole-document markdown (this app reads header fields, not tables),
 * falling back to the per-table markdown.
 */
export function doclingResultToText(result: DoclingResult): string {
  const docText = (result.markdown || '').trim();
  if (docText) return docText;
  return (result.tables || [])
    .map((t) => (t.markdown || '').trim())
    .filter(Boolean)
    .join('\n\n');
}
