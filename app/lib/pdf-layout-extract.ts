/**
 * Server-side PDF text extraction using pdfjs-dist.
 * Reconstructs layout-preserving text similar to `pdftotext -layout` output.
 * Each text item is placed at its approximate column position.
 */

export async function extractLayoutText(pdfBuffer: Buffer): Promise<string> {
  // CRITICAL: Pre-load the worker module onto globalThis BEFORE importing pdf.js.
  // pdfjs checks `globalThis.pdfjsWorker?.WorkerMessageHandler` first when setting
  // up its "fake worker" for Node.js. If present, it uses that directly instead of
  // trying to require('./pdf.worker.js') which fails in Next.js standalone builds.
  if (typeof globalThis !== 'undefined' && !(globalThis as any).pdfjsWorker) {
    try {
      (globalThis as any).pdfjsWorker = await import('pdfjs-dist/legacy/build/pdf.worker.js');
    } catch {
      // Ignore — pdfjs will try other fallback paths
    }
  }

  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.js');

  const doc = await pdfjsLib.getDocument({
    data: new Uint8Array(pdfBuffer),
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: true,
    disableFontFace: true,
    disableAutoFetch: true,
    disableStream: true,
  }).promise;

  let allText = '';

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
      const tx = ti.transform;
      if (!tx) continue;
      // PDF coordinates: origin at bottom-left, y increases upward
      // Convert to top-left origin
      const x = tx[4];
      const y = viewport.height - tx[5];
      const fontSize = Math.abs(tx[0]) || 10;
      items.push({ str: ti.str, x, y, width: ti.width || 0, fontSize });
    }

    if (items.length === 0) continue;

    // Group items into lines by y-coordinate (items within 3pt are on the same line)
    items.sort((a, b) => a.y - b.y || a.x - b.x);

    const lineGroups: TextItem[][] = [];
    let currentLine: TextItem[] = [items[0]];
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
    const pageWidth = viewport.width || 595;
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

    allText += pageText;
  }

  return allText;
}
