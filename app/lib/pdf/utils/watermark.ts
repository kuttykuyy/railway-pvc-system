import { PDFDocument, rgb, degrees } from 'pdf-lib';

/**
 * Stamps a free-trial statement so it cannot pass as an official document.
 *
 * The point of the trial is to prove the tool works and let the contractor check the
 * figures — not to hand out one submission-ready statement per account. So the mark
 * has to be clearly visible, but not so heavy it looks like junk or hides the numbers.
 * One light diagonal line across each page, plus a single footer strip on every page —
 * enough that nobody would submit it, calm enough that the figures stay easy to read.
 * Applied only to free-trial bills, and waived the moment the owner tops up, when the
 * official (unmarked) copy is generated.
 */
export async function applyTrialWatermark(pdfBytes: Uint8Array): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const pages = pdfDoc.getPages();

  const mark = 'TRIAL COPY - NOT FOR SUBMISSION';
  // Muted red: unmistakably "not official", without drowning the page in ink.
  const ink = rgb(0.82, 0.24, 0.24);
  const footer =
    'FREE TRIAL PREVIEW - not valid for official submission. Add credits to download the clean, official copy.';

  for (const page of pages) {
    const { width, height } = page.getSize();

    // One faint diagonal line running across the middle of the page. Size scales to the
    // page width so the whole line fits; opacity 0.07 keeps every figure underneath
    // clearly readable while the page still reads, at a glance, as a trial copy.
    const size = Math.max(20, Math.min(34, width / 17));
    page.drawText(mark, {
      x: width * 0.11,
      y: height * 0.34,
      size,
      color: ink,
      opacity: 0.10,
      rotate: degrees(38),
    });

    // A single quiet footer strip, on every page so it can't be cropped out.
    page.drawRectangle({ x: 0, y: 0, width, height: 18, color: ink, opacity: 0.06 });
    page.drawText(footer, {
      x: 20,
      y: 5.5,
      size: 8,
      color: ink,
      opacity: 0.9,
    });
  }

  return pdfDoc.save();
}
