import { PDFDocument, rgb, degrees } from 'pdf-lib';

/**
 * Adds a polite trial watermark to every page of a PDF: a soft diagonal
 * "TRIAL COPY" plus a friendly footer line letting the user know that topping
 * up their account removes the mark and unlocks the official copy.
 * Applied only for free-trial bills, and waived once the owner has topped up.
 */
export async function applyTrialWatermark(pdfBytes: Uint8Array): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const pages = pdfDoc.getPages();

  const mark = 'TRIAL COPY';
  const soft = rgb(0.30, 0.42, 0.72); // soft indigo — gentle, not an alarming red
  const footer =
    'This is a free trial preview. Please top up your account to remove this mark and download the official copy — thank you!';

  for (const page of pages) {
    const { width, height } = page.getSize();

    // Soft diagonal "TRIAL COPY", lightly tiled so it reads without shouting.
    const positions = [
      { x: width / 2 - 90, y: height / 2 + 20 },
      { x: width / 2 - 150, y: height / 2 - 180 },
      { x: width / 2 - 40, y: height / 2 + 220 },
    ];
    for (const pos of positions) {
      page.drawText(mark, {
        x: pos.x,
        y: pos.y,
        size: 40,
        color: soft,
        opacity: 0.12,
        rotate: degrees(45),
      });
    }

    // Friendly footer note near the bottom of every page.
    page.drawText(footer, {
      x: 20,
      y: 12,
      size: 9,
      color: soft,
      opacity: 0.8,
    });
  }

  return pdfDoc.save();
}
