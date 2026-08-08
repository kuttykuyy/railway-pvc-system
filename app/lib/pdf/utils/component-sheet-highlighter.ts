import { PDFDocument, rgb } from 'pdf-lib';

/**
 * Marks, on the non-steel index sheets attached to a bill, the figures its PVC actually
 * used — the same service the JPC highlighter gives the steel sheets.
 *
 * Two printed layouts are known, both measured off real attached sheets by detecting
 * their text bands, not estimated:
 *
 *  - The DPIIT "Wholesale Price Index" printout (cement, plant & machinery, other
 *    materials): one row of twelve monthly figures for a year. The used cells are the
 *    bill's months.
 *  - The Labour Bureau "Centre Index" printout (labour): twelve rows, one per month of a
 *    year. The used rows are the bill's months.
 *
 * Like the JPC marker, this places boxes by layout, so a page whose shape does not match
 * the production it knows is left untouched — a box over the wrong figure is a false
 * statement, not a missing one — and every marked page carries a printed note saying the
 * marks are a reading aid.
 *
 * The PPAC fuel sheets are deliberately not handled here: their rows are price-revision
 * dates, different on every sheet, so no fixed geometry can know which rows belong to a
 * month. Marking those needs the sheet's own text read at runtime.
 */

/** WPI printout: a portrait A4 page bearing one year-row of monthly figures. */
const WPI = {
  minRatio: 1.38,
  maxRatio: 1.45,
  /** Covers the month heading and the figure under it. */
  bandTop: 0.3225,
  bandBottom: 0.3425,
  /** Center of the "Jan" column; the twelve columns are evenly pitched. */
  firstMonthCenter: 0.1503,
  monthPitch: 0.0351,
  cellHalfWidth: 0.0176,
  /** The Month/Year label and the year printed under it. */
  yearColumn: [0.068, 0.097] as [number, number],
  noteTop: 0.40,
};

/** Labour Bureau printout: twelve month-rows under a shaded header. */
const LABOUR = {
  minRatio: 1.38,
  maxRatio: 1.45,
  /** Top of the January row; the twelve rows are evenly pitched. */
  firstRowTop: 0.1265,
  rowPitch: 0.018655,
  tableLeft: 0.062,
  tableRight: 0.458,
  noteTop: 0.375,
};

const WPI_TYPES = ['CEMENT', 'PLANT_MACHINERY_SPARES', 'OTHER_MATERIALS'];
const LABOUR_TYPES = ['LABOUR'];

export function componentSheetIsMarkable(componentType: string): boolean {
  return WPI_TYPES.includes(componentType) || LABOUR_TYPES.includes(componentType);
}

export interface ComponentHighlightOptions {
  componentType: string;
  /** Months (1–12) of this sheet's year that the bill actually used. */
  months: number[];
  /** Printed in the note, e.g. "SER/KGP/CIVIL/2024/0066 — B8". Optional. */
  caption?: string;
}

const FILL = rgb(1, 0.85, 0.25);
const EDGE = rgb(0.85, 0.55, 0);

/**
 * Returns the sheet with the used figures marked, or the bytes unchanged when no page has
 * the shape of a production this knows. Never throws: a supporting document must reach
 * the reader even if it cannot be marked.
 */
export async function highlightComponentSheet(
  pdfBytes: Uint8Array,
  options: ComponentHighlightOptions,
): Promise<{ bytes: Uint8Array; marked: boolean; reason?: string; pagesMarked?: number }> {
  try {
    const months = [...new Set(options.months)].filter(m => m >= 1 && m <= 12).sort((a, b) => a - b);
    if (months.length === 0) return { bytes: pdfBytes, marked: false, reason: 'no months to mark' };

    const layout = WPI_TYPES.includes(options.componentType)
      ? 'wpi'
      : LABOUR_TYPES.includes(options.componentType)
        ? 'labour'
        : null;
    if (!layout) return { bytes: pdfBytes, marked: false, reason: `no known layout for ${options.componentType}` };

    const doc = await PDFDocument.load(pdfBytes);
    let markedPages = 0;

    for (const page of doc.getPages()) {
      const { width, height } = page.getSize();
      const ratio = height / width;
      const yFor = (fractionFromTop: number) => height * (1 - fractionFromTop);

      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const monthList = months.map(m => monthNames[m - 1]).join(', ');
      let noteTop: number;

      if (layout === 'wpi') {
        if (ratio < WPI.minRatio || ratio > WPI.maxRatio) continue;
        const y = yFor(WPI.bandBottom);
        const h = (WPI.bandBottom - WPI.bandTop) * height;
        // The year label, so the row is identifiable.
        page.drawRectangle({
          x: WPI.yearColumn[0] * width,
          y,
          width: (WPI.yearColumn[1] - WPI.yearColumn[0]) * width,
          height: h,
          color: rgb(1, 0.93, 0.6),
          opacity: 0.35,
        });
        for (const m of months) {
          const center = WPI.firstMonthCenter + (m - 1) * WPI.monthPitch;
          page.drawRectangle({
            x: (center - WPI.cellHalfWidth) * width,
            y,
            width: WPI.cellHalfWidth * 2 * width,
            height: h,
            color: FILL,
            opacity: 0.45,
            borderColor: EDGE,
            borderWidth: 1,
          });
        }
        noteTop = WPI.noteTop;
      } else {
        if (ratio < LABOUR.minRatio || ratio > LABOUR.maxRatio) continue;
        for (const m of months) {
          const top = LABOUR.firstRowTop + (m - 1) * LABOUR.rowPitch;
          page.drawRectangle({
            x: LABOUR.tableLeft * width,
            y: yFor(top + LABOUR.rowPitch),
            width: (LABOUR.tableRight - LABOUR.tableLeft) * width,
            height: LABOUR.rowPitch * height,
            color: FILL,
            opacity: 0.35,
            borderColor: EDGE,
            borderWidth: 0.75,
          });
        }
        noteTop = LABOUR.noteTop;
      }
      markedPages++;

      // Say what the marks mean and, plainly, that they were placed by position rather
      // than read off the page — so nobody takes a box as confirmation of a figure.
      const note = `Shaded: ${monthList} — the months this bill's PVC used from this sheet`
        + `${options.caption ? ` — ${options.caption}` : ''}. Marks are a reading aid placed by layout; the figures are the sheet's own.`;
      const noteY = yFor(noteTop);
      page.drawRectangle({
        x: 0.06 * width,
        y: noteY - 12,
        width: width * 0.88,
        height: 20,
        color: rgb(1, 1, 1),
        opacity: 0.9,
      });
      page.drawText(note, {
        x: 0.065 * width,
        y: noteY - 4,
        size: 6,
        color: rgb(0.3, 0.3, 0.3),
        maxWidth: width * 0.87,
        lineHeight: 7.5,
      });
    }

    if (markedPages === 0) {
      return { bytes: pdfBytes, marked: false, reason: 'no page matched a known sheet shape' };
    }
    return { bytes: await doc.save(), marked: true, pagesMarked: markedPages };
  } catch (error: any) {
    console.error('Component sheet highlight failed:', error?.message || error);
    return { bytes: pdfBytes, marked: false, reason: 'could not be marked' };
  }
}
