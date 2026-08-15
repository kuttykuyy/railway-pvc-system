'use client';

import { PDFDocument } from 'pdf-lib';

/**
 * The same first-pages trim the server applies before reading an LOA or agreement —
 * done in the browser, BEFORE the upload.
 *
 * Vercel refuses any request body over ~4.5 MB at the platform edge, so a scanned
 * agreement never reached the route at all: the browser got a bare 413 "Content Too
 * Large" and the upload simply failed. The route's own "Maximum size is 100MB" check
 * could never run, and neither could the server-side trim — which discards everything
 * past the opening pages anyway.
 *
 * So nothing is lost by trimming here: these are the exact pages the extractor would
 * have kept. Pages are copied as they are — no compression, no re-encoding, no loss of
 * scan quality.
 */

// 12 mirrors PAGES_TO_SEND in lib/ai/agreement-extractor.ts — keep the two together.
// The smaller steps are fallbacks for scans so heavy that even twelve pages will not
// fit: better to read three pages than to fail the upload outright.
const PAGE_STEPS = [12, 6, 3, 1];
const PAGES_TO_SEND = PAGE_STEPS[0];

// Vercel's body limit is ~4.5 MB; leave room for the multipart envelope.
export const UPLOAD_BODY_LIMIT = 4 * 1024 * 1024;

export interface TrimResult {
  file: File;
  /** True when the file was reduced, so the caller can say so. */
  trimmed: boolean;
  originalBytes: number;
  finalBytes: number;
  pagesKept?: number;
  totalPages?: number;
  /** Set when the file is STILL too big to upload after trimming. */
  stillTooLarge: boolean;
}

export async function trimAgreementForUpload(file: File): Promise<TrimResult> {
  const originalBytes = file.size;
  const base: TrimResult = {
    file,
    trimmed: false,
    originalBytes,
    finalBytes: originalBytes,
    stillTooLarge: originalBytes > UPLOAD_BODY_LIMIT,
  };

  try {
    const src = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
    const totalPages = src.getPageCount();

    // A small file that the server would not have trimmed either: leave it alone.
    if (originalBytes <= UPLOAD_BODY_LIMIT && totalPages <= PAGES_TO_SEND) {
      return { ...base, totalPages, stillTooLarge: false };
    }

    // Step down until it fits. A heavy scan can exceed the limit even at twelve
    // pages, and reading three pages beats refusing the upload.
    let best: TrimResult | null = null;
    for (const step of PAGE_STEPS) {
      const keep = Math.min(step, totalPages);
      const trimmed = await PDFDocument.create();
      const pages = await trimmed.copyPages(src, Array.from({ length: keep }, (_, i) => i));
      pages.forEach((p) => trimmed.addPage(p));
      const bytes = await trimmed.save();
      const out = new File([bytes as any], file.name, { type: 'application/pdf' });
      best = {
        file: out,
        trimmed: keep < totalPages,
        originalBytes,
        finalBytes: out.size,
        pagesKept: keep,
        totalPages,
        stillTooLarge: out.size > UPLOAD_BODY_LIMIT,
      };
      if (out.size <= UPLOAD_BODY_LIMIT) return best;
    }
    return best ?? base;
  } catch {
    // An unreadable or encrypted PDF is the server's problem to report, not ours —
    // send it as it came and let the route answer properly.
    return base;
  }
}

/** What to tell someone whose PDF cannot be sent even after trimming. */
export function tooLargeMessage(result: TrimResult): string {
  const mb = (n: number) => (n / (1024 * 1024)).toFixed(1);
  return (
    `This PDF is ${mb(result.finalBytes)} MB, and uploads are limited to about 4 MB. `
    + 'It is most likely a high-resolution scan. Send just the first few pages — the '
    + 'agreement number, tender date, contractor and values are all we read — or use a '
    + 'lower scan quality, and try again.'
  );
}
