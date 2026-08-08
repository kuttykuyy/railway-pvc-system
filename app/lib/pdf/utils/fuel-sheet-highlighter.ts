import { PDFDocument, rgb } from 'pdf-lib';

/**
 * Marks, on the PPAC fuel sheets attached to a bill, the price rows its months used.
 *
 * These sheets differ from every other index document: each row is a price-REVISION
 * date, and the rows change from sheet to sheet, so no fixed geometry can know which
 * rows belong to June. But unlike the scans, PPAC publishes real text — so this reads
 * the dates printed on the sheet itself and marks the rows whose date falls in the
 * bill's months. Nothing is placed by guessed position: a row is marked because its own
 * printed date says it belongs.
 *
 * Each page carries two tables side by side (petrol left, diesel right); both are
 * marked. When the bill prices fuel by its zone city rather than the four-city average,
 * that city's column gets a stronger box where it crosses each marked row.
 */

interface DateToken {
  x: number;
  y: number;
  width: number;
  size: number;
}

export interface FuelHighlightOptions {
  /** The sheet-year being marked. */
  year: number;
  /** Months (1–12) of that year the bill used. */
  months: number[];
  /** Set to emphasise one city's column (zone-city pricing); omit for four-city average. */
  city?: string;
  caption?: string;
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

const CITY_HEADERS = ['Delhi', 'Mumbai', 'Chennai', 'Kolkata'];

/**
 * Returns the sheet with the used rows marked, or the bytes unchanged when nothing on it
 * matches. Never throws: a supporting document must reach the reader even if it cannot
 * be marked.
 */
export async function highlightFuelSheet(
  pdfBytes: Uint8Array,
  options: FuelHighlightOptions,
): Promise<{ bytes: Uint8Array; marked: boolean; reason?: string; pagesMarked?: number; rowsMarked?: number }> {
  try {
    const wanted = new Set(options.months.filter(m => m >= 1 && m <= 12));
    if (wanted.size === 0) return { bytes: pdfBytes, marked: false, reason: 'no months to mark' };

    // pdfjs reads the text; pdf-lib draws. Loaded on demand — this is the only server
    // path that needs text extraction. pdfjs expects a browser's drawing globals even
    // when only reading text; @napi-rs/canvas supplies them in Node.
    if (typeof (globalThis as any).DOMMatrix === 'undefined') {
      const canvas = await import('@napi-rs/canvas');
      (globalThis as any).DOMMatrix = (canvas as any).DOMMatrix;
      (globalThis as any).ImageData = (canvas as any).ImageData;
      (globalThis as any).Path2D = (canvas as any).Path2D;
    }
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const loadingTask = pdfjs.getDocument({
      data: pdfBytes.slice(),
      useSystemFonts: true,
    });
    const textDoc = await loadingTask.promise;

    const doc = await PDFDocument.load(pdfBytes);
    const pages = doc.getPages();
    let markedPages = 0;
    let rowsMarked = 0;

    const dateRe = /^\s*(\d{1,2})-([A-Za-z]{3})-(\d{2})\s*$/;

    for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
      const page = pages[pageIndex];
      const { width } = page.getSize();
      const textPage = await textDoc.getPage(pageIndex + 1);
      const content = await textPage.getTextContent();

      // Sort every dated row and every city header into the half-table it belongs to.
      const rows: { left: DateToken[]; right: DateToken[] } = { left: [], right: [] };
      const cityCols: { left: Map<string, DateToken>; right: Map<string, DateToken> } = {
        left: new Map(),
        right: new Map(),
      };

      for (const item of content.items as any[]) {
        if (!item.str || !item.transform) continue;
        const token: DateToken = {
          x: item.transform[4],
          y: item.transform[5],
          width: item.width || 0,
          size: Math.abs(item.transform[3]) || 6,
        };
        const half = token.x < width / 2 ? 'left' : 'right';

        const dateMatch = item.str.match(dateRe);
        if (dateMatch) {
          const month = MONTHS[dateMatch[2].toLowerCase()];
          const year = 2000 + parseInt(dateMatch[3], 10);
          if (month && wanted.has(month) && year === options.year) rows[half].push(token);
          continue;
        }
        const name = item.str.trim();
        if (CITY_HEADERS.includes(name) && !cityCols[half].has(name)) {
          cityCols[half].set(name, token);
        }
      }

      if (rows.left.length === 0 && rows.right.length === 0) continue;
      markedPages++;

      for (const half of ['left', 'right'] as const) {
        const dated = rows[half];
        if (dated.length === 0) continue;
        // The stripe runs from the date to the last city column of this half-table —
        // taken from the sheet's own headers, with a fixed fallback if they were not
        // found as single tokens.
        const headerTokens = [...cityCols[half].values()];
        const stripeLeft = Math.min(...dated.map(t => t.x)) - 3;
        const stripeRight = headerTokens.length
          ? Math.max(...headerTokens.map(t => t.x + t.width)) + 8
          : (half === 'left' ? width * 0.47 : width * 0.94);
        const cityToken = options.city ? cityCols[half].get(options.city) : undefined;

        for (const t of dated) {
          const h = t.size + 2.5;
          page.drawRectangle({
            x: stripeLeft,
            y: t.y - 1.5,
            width: stripeRight - stripeLeft,
            height: h,
            color: rgb(1, 0.85, 0.25),
            opacity: 0.3,
          });
          if (cityToken) {
            page.drawRectangle({
              x: cityToken.x - 6,
              y: t.y - 1.5,
              width: cityToken.width + 12,
              height: h,
              color: rgb(1, 0.85, 0.25),
              opacity: 0.3,
              borderColor: rgb(0.85, 0.55, 0),
              borderWidth: 0.75,
            });
          }
          rowsMarked++;
        }
      }

      // Say what the marks mean. These pages are dense to the margins, so the note goes
      // in the bottom margin on a white panel.
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const monthList = [...wanted].sort((a, b) => a - b).map(m => monthNames[m - 1]).join(', ');
      const note = `Shaded: price revisions in ${monthList} ${options.year} — the rows this bill's fuel index used`
        + `${options.city ? ` (${options.city} column)` : ' (four-city average)'}`
        + `${options.caption ? ` — ${options.caption}` : ''}. Rows found by their own printed dates; the figures are the sheet's own.`;
      page.drawRectangle({ x: width * 0.04, y: 4, width: width * 0.92, height: 18, color: rgb(1, 1, 1), opacity: 0.9 });
      page.drawText(note, {
        x: width * 0.045,
        y: 12,
        size: 6,
        color: rgb(0.3, 0.3, 0.3),
        maxWidth: width * 0.91,
        lineHeight: 7.5,
      });
    }

    await loadingTask.destroy();

    if (markedPages === 0) {
      return { bytes: pdfBytes, marked: false, reason: 'no rows dated in the bill months were found' };
    }
    return { bytes: await doc.save(), marked: true, pagesMarked: markedPages, rowsMarked };
  } catch (error: any) {
    console.error('Fuel sheet highlight failed:', error?.message || error);
    return { bytes: pdfBytes, marked: false, reason: 'could not be marked' };
  }
}
