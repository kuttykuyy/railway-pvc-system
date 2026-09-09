/**
 * Client helper: read a scanned LOA/agreement through the Docling OCR service.
 *
 * The extract route answers a scanned upload with `{ needsOcr: true }`. The form
 * then calls this to start an OCR job and poll it to completion, then re-submits
 * the document with the returned text. Talks only to our own `/api/ocr/*` proxy
 * routes — the browser never reaches Docling directly.
 */

export interface ScannedOcrResult {
  text: string;
  numTables: number;
  elapsedSec: number;
}

export class OcrError extends Error {}

/**
 * Start an OCR job for `file` and poll until it finishes. `onProgress` reports a
 * short status so the UI can show "reading…". Rejects with an OcrError on failure
 * or timeout (default 15 min — a big scan on a CPU host is slow).
 */
export async function runScannedOcr(
  file: File,
  opts: { onProgress?: (status: string) => void; pollMs?: number; timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<ScannedOcrResult> {
  const pollMs = opts.pollMs ?? 3000;
  const timeoutMs = opts.timeoutMs ?? 15 * 60 * 1000;
  const onProgress = opts.onProgress ?? (() => {});

  const startJob = async (): Promise<string> => {
    onProgress('Uploading the scan…');
    const form = new FormData();
    form.append('file', file);
    const startRes = await fetch('/api/ocr/start', { method: 'POST', body: form, signal: opts.signal });
    if (!startRes.ok) {
      const body = await startRes.json().catch(() => ({}));
      throw new OcrError(body?.error || 'Could not start reading the scanned PDF.');
    }
    const { jobId } = (await startRes.json()) as { jobId?: string };
    if (!jobId) throw new OcrError('The scan could not be queued. Please try again.');
    return jobId;
  };

  let jobId = await startJob();
  let restarts = 0;
  const deadline = Date.now() + timeoutMs;
  onProgress('Reading the scan… this can take a few minutes.');
  for (;;) {
    if (opts.signal?.aborted) throw new OcrError('Cancelled.');
    if (Date.now() > deadline) throw new OcrError('Reading the scan took too long. Please try again.');
    await new Promise((r) => setTimeout(r, pollMs));

    const res = await fetch(`/api/ocr/${encodeURIComponent(jobId)}`, { signal: opts.signal });
    if (!res.ok) continue; // transient poll failure — keep trying until the deadline
    const data = (await res.json()) as {
      status: string; code?: string; text?: string; numTables?: number; elapsedSec?: number; error?: string;
    };
    if (data.status === 'done') {
      onProgress('Read complete. Reading the fields…');
      return { text: data.text || '', numTables: data.numTables || 0, elapsedSec: data.elapsedSec || 0 };
    }
    if (data.status === 'error') {
      // The reader keeps jobs in memory; if it restarted mid-read the job is gone. Resend
      // the scan once so a transient restart doesn't waste the user's wait or their upload.
      if (data.code === 'job_not_found' && restarts < 1) {
        restarts += 1;
        jobId = await startJob();
        onProgress('The reader restarted — reading the scan again…');
        continue;
      }
      throw new OcrError(data.error || 'The scan could not be read.');
    }
    // queued / processing → keep polling.
  }
}
