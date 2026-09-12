import { PDFDocument, rgb, degrees } from 'pdf-lib';

/**
 * Stamps a free-trial statement so it cannot pass as an official document.
 *
 * The point of the trial is to prove the tool works and let the contractor check the
 * figures — not to hand out one submission-ready statement per account. The earlier
 * mark was "TRIAL COPY" at 0.12 opacity: so faint it was effectively a clean PDF, so
 * people downloaded it, deleted the bill and never paid. This reads clearly across
 * every page — a repeated diagonal band that cannot be cropped off — while staying
 * legible enough to verify the numbers. Applied only to free-trial bills, and waived
 * the moment the owner tops up, when the official (unmarked) copy is generated.
 */
export async function applyTrialWatermark(pdfBytes: Uint8Array): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const pages = pdfDoc.getPages();

  const mark = 'TRIAL - NOT FOR SUBMISSION';
  // Muted red: unmistakably "not official", without drowning the page in ink.
  const ink = rgb(0.80, 0.16, 0.16);
  const footer =
    'FREE TRIAL PREVIEW - not valid for official submission. Add credits to download the clean, official copy.';

  for (const page of pages) {
    const { width, height } = page.getSize();

    // A repeated diagonal band, corner to corner, tiled down the page so no single
    // crop removes it. Visible but light (0.10) so the figures underneath stay readable.
    const step = 150;
    for (let y = -step; y < height + step; y += step) {
      page.drawText(mark, {
        x: 40,
        y,
        size: 26,
        color: ink,
        opacity: 0.10,
        rotate: degrees(30),
      });
      page.drawText(mark, {
        x: width / 2 - 20,
        y: y + step / 2,
        size: 26,
        color: ink,
        opacity: 0.10,
        rotate: degrees(30),
      });
    }

    // One bold, solid stamp across the middle — the thing a glance lands on.
    page.drawText('TRIAL COPY', {
      x: width / 2 - 150,
      y: height / 2,
      size: 46,
      color: ink,
      opacity: 0.22,
      rotate: degrees(30),
    });

    // A clear footer strip on every page.
    page.drawRectangle({ x: 0, y: 0, width, height: 20, color: ink, opacity: 0.08 });
    page.drawText(footer, {
      x: 20,
      y: 6,
      size: 8.5,
      color: ink,
      opacity: 0.95,
    });
  }

  return pdfDoc.save();
}
