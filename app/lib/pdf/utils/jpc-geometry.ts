import { JPC_ITEMS, PVC_CALCULATION_ITEMS } from '@/lib/jpc-items';

/**
 * The printed JPC sheet's geometry and the rows the PVC formula reads — shared by the
 * server-side marker (jpc-highlighter, drawing into bill PDFs) and the browser viewer
 * (official-sheet-viewer, drawing onto its canvas). One set of measurements, so the
 * marks a user sees on screen and the marks on the bill can never disagree.
 *
 * Pure data and arithmetic only: this module must stay importable by client code
 * without dragging pdf-lib into the browser bundle.
 */

/** Where the table sits on a sheet of a given shape, as fractions of width and height. */
export interface JpcTemplate {
  /** Page height ÷ width — the shape that identifies this production of the sheet. */
  minRatio: number;
  maxRatio: number;
  /** Top of row 1 and bottom of row 24 — the 24 rows divide this evenly. */
  bodyTop: number;
  bodyBottom: number;
  columns: Record<string, [number, number]>;
  /** Clear space under the table, above the printed address block. */
  noteTop: number;
}

// Every geometry below is measured off a rendered sheet by detecting its ruled lines,
// not estimated. The right edge of each city column matters — set a hair short and the
// box clips the last digit of the figure it is pointing at.
export const JPC_TEMPLATES: JpcTemplate[] = [
  // The sheet scanned to full portrait A4 (ratio ≈ 1.414).
  {
    minRatio: 1.35,
    maxRatio: 1.50,
    bodyTop: 0.3055,
    bodyBottom: 0.8790,
    columns: {
      item: [0.120, 0.475],
      Kolkata: [0.475, 0.594],
      Delhi: [0.594, 0.708],
      Mumbai: [0.708, 0.822],
      Chennai: [0.822, 0.937],
    },
    noteTop: 0.892,
  },
  // The same sheet cropped tighter in scanning (520 × 673 pt, ratio ≈ 1.294) — the
  // shape of every sheet already attached to bills before full-quality uploads. Same
  // table, different margins, so the fractions differ throughout.
  {
    minRatio: 1.22,
    maxRatio: 1.33,
    bodyTop: 0.3001,
    bodyBottom: 0.8770,
    columns: {
      item: [0.1522, 0.4788],
      Kolkata: [0.4788, 0.5849],
      Delhi: [0.5849, 0.6910],
      Mumbai: [0.6910, 0.7961],
      Chennai: [0.7961, 0.9022],
    },
    noteTop: 0.885,
  },
];

export const JPC_TABLE_ROWS = 24;

/** The template for a page of this shape, or null when none describes it. */
export function findJpcTemplate(heightOverWidth: number): JpcTemplate | null {
  return JPC_TEMPLATES.find(t => heightOverWidth >= t.minRatio && heightOverWidth <= t.maxRatio) ?? null;
}

/** The six rows the GCC 46A.9(1) formula reads, by their serial number on the sheet. */
export function calculationRowNumbers(): Array<{ sno: number; name: string; feeds: string[] }> {
  const feedsByCode = new Map<string, string[]>();
  for (const [section, codes] of Object.entries(PVC_CALCULATION_ITEMS)) {
    for (const code of codes as string[]) {
      feedsByCode.set(code, [...(feedsByCode.get(code) || []), section]);
    }
  }
  return JPC_ITEMS
    .filter(item => feedsByCode.has(item.id))
    .map(item => ({ sno: item.sno, name: item.name, feeds: feedsByCode.get(item.id)! }))
    .sort((a, b) => a.sno - b.sno);
}
