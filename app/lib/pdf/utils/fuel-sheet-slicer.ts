import { PDFDocument } from 'pdf-lib';

/**
 * Cuts a PPAC fuel document down to the pages the bill's period actually uses.
 *
 * The JPC sheets slice by position — six pages a month, every year the same. Fuel
 * sheets have no such rhythm: each page holds however many price-revision rows fit,
 * and the spans differ from sheet to sheet. But PPAC publishes real text, so a page
 * can be judged by what is printed on it. A page is kept because its own dates say it
 * belongs — never by guessed position.
 *
 * Belonging is judged against a DATE WINDOW, not a month list, for three reasons
 * found the hard way:
 *
 *  - A diesel price holds until the next revision, so the figure that governs the
 *    first days of the bill's first month sits on the LAST revision before it — often
 *    printed on a page whose dates all belong to the previous month. The window
 *    therefore starts weeks before the first used month.
 *  - Revision runs cross year boundaries; judging a date by "is its month used in this
 *    document's year" cut January pages out of a December document and vice versa.
 *    A window of real dates has no year seam.
 *  - A page whose dates cannot be read is KEPT, not dropped. Only a page that
 *    legibly says "I am outside the window" may be left out of a legal document.
 *
 * Fallbacks are attach-whole, always: no readable dates anywhere (a scan), every page
 * needed, or no page matching.
 */

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

export interface FuelSliceWindow {
  /** Earliest revision date the bill can depend on (first used month minus carry-over). */
  windowStart: Date;
  /** Last day of the bill's last used month. */
  windowEnd: Date;
}

export async function sliceFuelSheetByMonths(
  pdfBytes: Uint8Array,
  options: FuelSliceWindow,
): Promise<{ bytes: Uint8Array; sliced: boolean; keptPages?: number; totalPages?: number; reason?: string }> {
  try {
    const startMs = options.windowStart.getTime();
    const endMs = options.windowEnd.getTime();
    if (!(startMs < endMs)) return { bytes: pdfBytes, sliced: false, reason: 'empty window' };

    // pdfjs reads the dates; pdf-lib cuts the pages. pdfjs expects a browser's drawing
    // globals even when only reading text; @napi-rs/canvas supplies them in Node.
    if (typeof (globalThis as any).DOMMatrix === 'undefined') {
      const canvas = await import('@napi-rs/canvas');
      (globalThis as any).DOMMatrix = (canvas as any).DOMMatrix;
      (globalThis as any).ImageData = (canvas as any).ImageData;
      (globalThis as any).Path2D = (canvas as any).Path2D;
    }
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const loadingTask = pdfjs.getDocument({ data: pdfBytes.slice(), useSystemFonts: true });
    const textDoc = await loadingTask.promise;

    const dateRe = /^\s*(\d{1,2})-([A-Za-z]{3})-(\d{2})\s*$/;
    const keep: number[] = [];
    let anyDateAnywhere = false;

    for (let pageIndex = 1; pageIndex <= textDoc.numPages; pageIndex++) {
      const page = await textDoc.getPage(pageIndex);
      const content = await page.getTextContent();
      let pageHasDates = false;
      let pageMatches = false;
      for (const item of content.items as any[]) {
        const match = item.str?.match(dateRe);
        if (!match) continue;
        const month = MONTHS[match[2].toLowerCase()];
        if (!month) continue;
        pageHasDates = true;
        anyDateAnywhere = true;
        const day = parseInt(match[1], 10);
        const year = 2000 + parseInt(match[3], 10);
        const ms = Date.UTC(year, month - 1, day);
        if (ms >= startMs && ms <= endMs) {
          pageMatches = true;
          break;
        }
      }
      // Dates outside the window are the ONLY licence to drop a page. Unreadable pages
      // stay in — a legal attachment errs toward carrying too much, never too little.
      if (pageMatches || !pageHasDates) keep.push(pageIndex - 1);
    }
    await loadingTask.destroy();

    const total = textDoc.numPages;
    if (!anyDateAnywhere) return { bytes: pdfBytes, sliced: false, totalPages: total, reason: 'no readable dates — likely a scan' };
    if (keep.length === 0) return { bytes: pdfBytes, sliced: false, totalPages: total, reason: 'no page falls in the used window' };
    if (keep.length === total) return { bytes: pdfBytes, sliced: false, totalPages: total, reason: 'every page falls in the used window' };

    const src = await PDFDocument.load(pdfBytes);
    const out = await PDFDocument.create();
    const pages = await out.copyPages(src, keep);
    pages.forEach(p => out.addPage(p));
    return { bytes: await out.save(), sliced: true, keptPages: keep.length, totalPages: total };
  } catch (error: any) {
    console.error('Fuel sheet slicing failed:', error?.message || error);
    return { bytes: pdfBytes, sliced: false, reason: 'could not be sliced' };
  }
}
