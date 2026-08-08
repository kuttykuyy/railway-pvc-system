import { PDFDocument, rgb } from 'pdf-lib';
import { JPC_TEMPLATES, JPC_TABLE_ROWS, calculationRowNumbers } from './jpc-geometry';

// The measurements and the six formula rows live in jpc-geometry, shared with the
// browser viewer so on-screen marks and bill marks can never disagree.
export { calculationRowNumbers } from './jpc-geometry';

/**
 * Marks, on the JPC sheet attached to a bill, the cells its steel indices were actually
 * built from.
 *
 * The sheet carries 24 rows across four cities — 96 figures — of which six rows and one
 * column were used. Reading a statement means finding those by eye, twice, and an
 * accounts office checking a claim should not have to.
 *
 * The sheets are photocopier scans with no text layer, so there is nothing to anchor to:
 * the geometry below is the printed JPC template, expressed as fractions of the page so
 * it holds at any scan resolution. That is also its weakness — a sheet cropped or skewed
 * differently would be marked in the wrong place, and a box over the wrong number is a
 * false statement, not a missing one. So this refuses to draw unless the page has the
 * shape of a production it knows, and every marked page carries a printed note saying
 * the marks are a reading aid and the figures are the sheet's own.
 */


export const HIGHLIGHT_CITIES = ['Kolkata', 'Delhi', 'Mumbai', 'Chennai'] as const;
export type HighlightCity = typeof HIGHLIGHT_CITIES[number];


export interface HighlightOptions {
  /** The bill's JPC city — only this column is marked. */
  city: HighlightCity;
  /** Printed under the table, e.g. "SR/MDU/Civil/2024/0037 — B8". Optional. */
  caption?: string;
}

/**
 * Returns the sheet with the used cells marked, or the bytes unchanged when the page is
 * not the layout this template describes. Never throws: a supporting document must reach
 * the reader even if it cannot be marked.
 */
export async function highlightJpcSheet(
  pdfBytes: Uint8Array,
  options: HighlightOptions,
): Promise<{ bytes: Uint8Array; marked: boolean; reason?: string; pagesMarked?: number }> {
  try {
    const doc = await PDFDocument.load(pdfBytes);
    const pages = doc.getPages();
    if (pages.length === 0) return { bytes: pdfBytes, marked: false, reason: 'empty document' };

    if (!HIGHLIGHT_CITIES.includes(options.city)) {
      return { bytes: pdfBytes, marked: false, reason: `unknown city ${options.city}` };
    }

    const rows = calculationRowNumbers();

    // Only the first page of each three-page fortnight carries the 24-item table this
    // geometry describes; the second page is a different table (items 25-34) and the
    // third a disclaimer, and marking those put boxes on the wrong rows. Documents
    // start at a fortnight's first page — whole years, month slices and single sheets
    // alike — so every third page is a first page.
    let markedPages = 0;
    for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
    if (pageIndex % 3 !== 0) continue;
    const page = pages[pageIndex];
    const { width, height } = page.getSize();

    // Pick the geometry for this page's shape. A shape none of the templates describe is
    // a differently-produced sheet whose cells would be marked in the wrong place, so
    // that page is left alone.
    const ratio = height / width;
    const table = JPC_TEMPLATES.find(t => ratio >= t.minRatio && ratio <= t.maxRatio);
    if (!table) {
      continue;
    }
    const column = table.columns[options.city];
    const rowHeight = (table.bodyBottom - table.bodyTop) / JPC_TABLE_ROWS;
    markedPages++;

    // pdf-lib measures from the bottom-left; the fractions above are from the top.
    const yFor = (fractionFromTop: number) => height * (1 - fractionFromTop);

    for (const row of rows) {
      const top = table.bodyTop + (row.sno - 1) * rowHeight;
      const y = yFor(top + rowHeight);
      const h = rowHeight * height;

      // The item name, so the row is identifiable, and the one city's figure.
      page.drawRectangle({
        x: table.columns.item[0] * width,
        y,
        width: (table.columns.item[1] - table.columns.item[0]) * width,
        height: h,
        color: rgb(1, 0.93, 0.6),
        opacity: 0.35,
      });
      page.drawRectangle({
        x: column[0] * width,
        y,
        width: (column[1] - column[0]) * width,
        height: h,
        color: rgb(1, 0.85, 0.25),
        opacity: 0.45,
        borderColor: rgb(0.85, 0.55, 0),
        borderWidth: 1,
      });
    }

    // Say what the marks mean and, plainly, that they were placed by position rather than
    // read off the page — so nobody takes a box as confirmation of a figure.
    const note = `Shaded: the ${rows.length} items and the ${options.city} column used for the steel indices under GCC 46A.9(1)`
      + `${options.caption ? ` — ${options.caption}` : ''}. Marks are a reading aid placed by layout; the figures are the sheet's own.`;
    // On white, in the gap under the table. Drawn over a white panel because the sheet is
    // a scan — grey paper behind grey text is unreadable, and this note is the one thing
    // on the page that must not be missed.
    const noteY = yFor(table.noteTop);
    page.drawRectangle({
      x: 0.115 * width,
      y: noteY - 12,
      width: width * 0.83,
      height: 20,
      color: rgb(1, 1, 1),
      opacity: 0.9,
    });
    page.drawText(note, {
      x: 0.120 * width,
      y: noteY - 4,
      size: 6,
      color: rgb(0.3, 0.3, 0.3),
      maxWidth: width * 0.82,
      lineHeight: 7.5,
    });
    }

    if (markedPages === 0) {
      return { bytes: pdfBytes, marked: false, reason: 'no page matched a known JPC sheet shape' };
    }

    return { bytes: await doc.save(), marked: true, pagesMarked: markedPages };
  } catch (error: any) {
    console.error('JPC highlight failed:', error?.message || error);
    return { bytes: pdfBytes, marked: false, reason: 'could not be marked' };
  }
}
