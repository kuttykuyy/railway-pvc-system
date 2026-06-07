import { PDFDocument, rgb, degrees } from 'pdf-lib';

/**
 * Adds a diagonal "TRIAL — NOT FOR OFFICIAL USE" watermark to every page of a PDF.
 * Applied only for free-trial bills (isChargeable === false).
 */
export async function applyTrialWatermark(pdfBytes: Uint8Array): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const pages = pdfDoc.getPages();

  for (const page of pages) {
    const { width, height } = page.getSize();

    // Line 1
    page.drawText('TRIAL — NOT FOR OFFICIAL USE', {
      x: width / 2 - 160,
      y: height / 2 + 20,
      size: 36,
      color: rgb(0.85, 0.1, 0.1),
      opacity: 0.15,
      rotate: degrees(45),
    });

    // Line 2 — slightly offset so it tiles across the page
    page.drawText('TRIAL — NOT FOR OFFICIAL USE', {
      x: width / 2 - 200,
      y: height / 2 - 180,
      size: 36,
      color: rgb(0.85, 0.1, 0.1),
      opacity: 0.15,
      rotate: degrees(45),
    });

    page.drawText('TRIAL — NOT FOR OFFICIAL USE', {
      x: width / 2 - 120,
      y: height / 2 + 220,
      size: 36,
      color: rgb(0.85, 0.1, 0.1),
      opacity: 0.15,
      rotate: degrees(45),
    });
  }

  return pdfDoc.save();
}
