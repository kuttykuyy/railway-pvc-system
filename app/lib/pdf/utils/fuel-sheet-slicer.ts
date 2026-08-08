import { PDFDocument } from 'pdf-lib';

/**
 * Cuts a PPAC fuel document down to the pages the bill's months actually use.
 *
 * The JPC sheets slice by position — six pages a month, every year the same. Fuel
 * sheets have no such rhythm: each page holds however many price-revision rows fit,
 * and the spans differ from sheet to sheet. But PPAC publishes real text, so a page
 * can be judged by what is printed on it: keep the page if any revision date on it
 * falls in a used month, drop it if none does. A page is kept because its own dates
 * say it belongs — never by guessed position.
 *
 * Fallbacks are attach-whole, always: a document with no readable dates (a scan), or
 * one where every page matches, or one where none does, goes in unchanged. Dropping
 * pages from a legal document is only defensible when each dropped page itself said
 * it was not needed.
 */

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

export interface FuelSliceOptions {
  /** The document's year. */
  year: number;
  /** Months (1–12) of that year the bill used. */
  months: number[];
}

export async function sliceFuelSheetByMonths(
  pdfBytes: Uint8Array,
  options: FuelSliceOptions,
): Promise<{ bytes: Uint8Array; sliced: boolean; keptPages?: number; totalPages?: number; reason?: string }> {
  try {
    const wanted = new Set(options.months.filter(m => m >= 1 && m <= 12));
    if (wanted.size === 0) return { bytes: pdfBytes, sliced: false, reason: 'no months requested' };

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
      let pageMatches = false;
      for (const item of content.items as any[]) {
        const match = item.str?.match(dateRe);
        if (!match) continue;
        anyDateAnywhere = true;
        const month = MONTHS[match[2].toLowerCase()];
        const year = 2000 + parseInt(match[3], 10);
        if (month && year === options.year && wanted.has(month)) {
          pageMatches = true;
          break;
        }
      }
      if (pageMatches) keep.push(pageIndex - 1);
    }
    await loadingTask.destroy();

    const total = textDoc.numPages;
    if (!anyDateAnywhere) return { bytes: pdfBytes, sliced: false, totalPages: total, reason: 'no readable dates — likely a scan' };
    if (keep.length === 0) return { bytes: pdfBytes, sliced: false, totalPages: total, reason: 'no page carries the used months' };
    if (keep.length === total) return { bytes: pdfBytes, sliced: false, totalPages: total, reason: 'every page carries the used months' };

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
