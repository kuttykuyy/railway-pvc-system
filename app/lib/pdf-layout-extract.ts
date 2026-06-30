/**
 * Server-side PDF text extraction using pdfjs-dist.
 * Reconstructs layout-preserving text similar to `pdftotext -layout` output.
 * Each text item is placed at its approximate column position.
 */

export interface PositionedPdfTextItem {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PositionedPdfPage {
  pageNumber: number;
  width: number;
  height: number;
  items: PositionedPdfTextItem[];
}

export async function extractPositionedPdfPages(pdfBuffer: Buffer): Promise<PositionedPdfPage[]> {
  // CRITICAL: Pre-load the worker module onto globalThis BEFORE importing pdf.js.
  // pdfjs checks `globalThis.pdfjsWorker?.WorkerMessageHandler` first when setting
  // up its "fake worker" for Node.js. If present, it uses that directly instead of
  // trying to require('./pdf.worker.js') which fails in Next.js standalone builds.
  if (typeof globalThis !== 'undefined' && !(globalThis as any).pdfjsWorker) {
    try {
      // @ts-ignore
      (globalThis as any).pdfjsWorker = await import('pdfjs-dist/legacy/build/pdf.worker.mjs');
    } catch {
      // pdfjs can initialize its Node fake worker when explicit preload is unavailable.
    }
  }

  // @ts-ignore
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');

  const doc = await pdfjsLib.getDocument({
    data: new Uint8Array(pdfBuffer),
    useWorkerFetch: false,
    useSystemFonts: true,
    disableFontFace: true,
    disableAutoFetch: true,
    disableStream: true,
  }).promise;

  const pages: PositionedPdfPage[] = [];

  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1.0 });
    const textContent = await page.getTextContent();

    // Collect text items with their positions
    interface TextItem {
      str: string;
      x: number;  // left position in points
      y: number;  // top position (inverted from PDF coords)
      width: number;
      fontSize: number;
    }
    const items: TextItem[] = [];

    for (const item of textContent.items) {
      const ti = item as any;
      if (!ti.str || ti.str.trim() === '') continue;
      if (!ti.transform) continue;
      const tx = pdfjsLib.Util.transform(viewport.transform, ti.transform);
      const x = tx[4];
      const fontSize = Math.hypot(tx[2], tx[3]) || Math.hypot(tx[0], tx[1]) || 10;
      const y = tx[5] - fontSize;
      const text = String(ti.str);
      const width = Number(ti.width || 0);
      const words = Array.from(text.matchAll(/\S+/g));
      if (words.length > 1 && width > 0) {
        for (const word of words) {
          const startRatio = (word.index || 0) / text.length;
          const widthRatio = word[0].length / text.length;
          items.push({
            str: word[0],
            x: x + width * startRatio,
            y,
            width: width * widthRatio,
            fontSize,
          });
        }
      } else {
        items.push({ str: text, x, y, width, fontSize });
      }
    }

    pages.push({
      pageNumber: pageNum,
      width: viewport.width,
      height: viewport.height,
      items: items.map(item => ({
        text: item.str,
        x: item.x,
        y: item.y,
        width: item.width,
        height: item.fontSize,
      })),
    });
  }

  return pages;
}

export async function extractLayoutText(pdfBuffer: Buffer): Promise<string> {
  const pages = await extractPositionedPdfPages(pdfBuffer);
  let allText = '';

  for (const page of pages) {
    type LayoutTextItem = { str: string; x: number; y: number; width: number; fontSize: number };
    const items: LayoutTextItem[] = page.items.map(item => ({
      str: item.text,
      x: item.x,
      y: item.y,
      width: item.width,
      fontSize: item.height,
    }));

    if (items.length === 0) continue;

    // Group items into lines by y-coordinate (items within 3pt are on the same line)
    items.sort((a, b) => a.y - b.y || a.x - b.x);

    const lineGroups: LayoutTextItem[][] = [];
    let currentLine: LayoutTextItem[] = [items[0]];
    let currentY = items[0].y;

    for (let i = 1; i < items.length; i++) {
      if (Math.abs(items[i].y - currentY) > 3) {
        lineGroups.push(currentLine);
        currentLine = [items[i]];
        currentY = items[i].y;
      } else {
        currentLine.push(items[i]);
      }
    }
    lineGroups.push(currentLine);

    // Convert page width in points to character columns
    // Typical PDF page width ~595pt (A4), typical char width ~5-6pt for monospace
    // We aim for ~180 char wide output to match pdftotext -layout
    const pageWidth = page.width || 595;
    const charWidth = pageWidth / 180;

    // Build layout text
    let pageText = '';
    for (const lineItems of lineGroups) {
      lineItems.sort((a, b) => a.x - b.x);
      let line = '';
      for (const item of lineItems) {
        const col = Math.round(item.x / charWidth);
        // Pad to reach the column position
        while (line.length < col) line += ' ';
        line += item.str;
      }
      pageText += line + '\n';
    }

    allText += `Page ${page.pageNumber} of ${pages.length}\n${pageText}`;
  }

  return allText;
}
