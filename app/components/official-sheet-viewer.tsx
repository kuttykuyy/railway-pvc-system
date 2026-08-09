'use client';

import { useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { ChevronLeft, ChevronRight, FileSearch } from 'lucide-react';
import toast from 'react-hot-toast';
import { calculationRowNumbers, JPC_TABLE_ROWS } from '@/lib/pdf/utils/jpc-geometry';


/**
 * The official JPC sheet, readable beside the extracted numbers — month by month.
 *
 * The sheets are uploaded one PDF per year, and the pages inside follow the JPC's own
 * rhythm: two fortnights a month, three pages a fortnight, six pages a month. Nobody
 * checking a March rate should flip through January and February to reach it, so the
 * viewer slices the year to the chosen month and labels each page with its fortnight.
 *
 * The slice is trusted only when the page count actually equals six per recorded month —
 * a missing fortnight or a stray cover page would silently shift every month after it,
 * and showing February under the label "March" is worse than free flipping. When the
 * rhythm doesn't hold, navigation falls back to plain pages with a note.
 *
 * View-only throughout: canvas rendering, no download control, short-lived URLs, the
 * viewer's own email drawn across each page. Deterrents, not locks — the aim is keeping
 * a paid publication readable against a claim, not republished.
 */

interface SheetOption {
  id: string;
  fileName: string;
  months: number[];
  coversMonth: boolean;
}

/**
 * Makes a photocopied sheet easier to read. It adds no information — every pixel it
 * shows was already in the scan — it stops the scanner's narrow tonal range from
 * hiding what is there: on a real sheet the ink sits at 69 and the paper at 255, so a
 * third of the available contrast is simply unused, and the digits swim in grey.
 *
 * Auto-levels stretches the page's own range to full black-to-white, then an unsharp
 * mask puts the edges back that scanning and JPEG rounded off. Applied to the canvas
 * only: the stored document is never touched, and the marks and watermark are drawn
 * after it so they stay clean.
 */
function enhanceScan(context: CanvasRenderingContext2D, width: number, height: number) {
  const image = context.getImageData(0, 0, width, height);
  const data = image.data;
  const n = width * height;

  const lum = new Uint8Array(n);
  for (let i = 0, j = 0; j < n; i += 4, j++) {
    lum[j] = (data[i] * 77 + data[i + 1] * 150 + data[i + 2] * 29) >> 8;
  }

  // Auto-levels from the page's own histogram, ignoring the extreme half-percent so a
  // few dust specks cannot set the black point.
  const hist = new Uint32Array(256);
  for (let j = 0; j < n; j++) hist[lum[j]]++;
  const cut = n * 0.005;
  let lo = 0, hi = 255, acc = 0;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc > cut) { lo = v; break; } }
  acc = 0;
  for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc > cut) { hi = v; break; } }
  // A page with almost no tonal range is not a scan to stretch — leave it alone.
  if (hi - lo < 32) return;
  const span = hi - lo;

  const stretched = new Uint8Array(n);
  for (let j = 0; j < n; j++) {
    const v = ((lum[j] - lo) * 255) / span;
    stretched[j] = v < 0 ? 0 : v > 255 ? 255 : v;
  }

  // Separable 3-tap blur, then unsharp — sharpens strokes without hunting for edges.
  const tmp = new Uint8Array(n);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      const a = stretched[row + (x > 0 ? x - 1 : x)];
      const b = stretched[row + x];
      const c = stretched[row + (x < width - 1 ? x + 1 : x)];
      tmp[row + x] = (a + b + b + c) >> 2;
    }
  }
  const blur = new Uint8Array(n);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    const up = (y > 0 ? y - 1 : y) * width;
    const dn = (y < height - 1 ? y + 1 : y) * width;
    for (let x = 0; x < width; x++) {
      blur[row + x] = (tmp[up + x] + tmp[row + x] + tmp[row + x] + tmp[dn + x]) >> 2;
    }
  }

  const amount = 0.9;
  for (let i = 0, j = 0; j < n; i += 4, j++) {
    let v = stretched[j] + amount * (stretched[j] - blur[j]);
    v = v < 0 ? 0 : v > 255 ? 255 : v;
    // Scale the original channels toward the new luminance rather than flattening to
    // grey, so the sheet keeps what colour it has (the JPC crest is red).
    const k = v / (lum[j] || 1);
    data[i] = Math.min(255, data[i] * k);
    data[i + 1] = Math.min(255, data[i + 1] * k);
    data[i + 2] = Math.min(255, data[i + 2] * k);
  }
  context.putImageData(image, 0, 0);
}

/**
 * The table's own column proportions, measured off real sheets and expressed within the
 * table frame rather than the page: table edge | Sl.No | ITEM | Kolkata | Delhi |
 * Mumbai | Chennai. Because they are relative to the frame, one set fits every scan
 * crop and every production of the sheet — only the frame itself moves.
 */
const COLUMN_FRACTIONS = [0, 0.112, 0.436, 0.577, 0.718, 0.859, 1];

/** Where the table sits, as fractions of the page. Corners are dragged; rows follow. */
interface TableFrame { x0: number; y0: number; x1: number; y1: number }

/** A sensible starting frame for a sheet nobody has positioned yet. */
const DEFAULT_FRAME: TableFrame = { x0: 0.152, y0: 0.300, x1: 0.902, y1: 0.878 };

const frameStorageKey = (sheetId: string) => `jpc-frame:${sheetId}`;

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const PAGES_PER_FORTNIGHT = 3;
const PAGES_PER_MONTH = PAGES_PER_FORTNIGHT * 2;

export function OfficialSheetViewer({ year, initialMonth }: { year: number; initialMonth: number }) {
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [sheets, setSheets] = useState<SheetOption[]>([]);
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [pdf, setPdf] = useState<any>(null);
  const [docMonths, setDocMonths] = useState<number[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(initialMonth);
  /** Position inside the current view: within the month slice, or absolute when free. */
  const [position, setPosition] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  /** True when the document's page count fits the six-pages-per-month rhythm. */
  const [sliced, setSliced] = useState(false);
  const [wholeYear, setWholeYear] = useState(false);
  /** The same six-row + city marks the bills carry, drawn on the canvas — toggleable. */
  const [showHighlights, setShowHighlights] = useState(true);
  /**
   * Where the price table sits on the page — dragged by the reader, not guessed.
   *
   * Automatic detection read the table's ruled lines, and on these scans it kept
   * losing: tilt, contrast, crop and three different productions of the sheet each
   * broke it in a different way, and a mark in the wrong place on a paid publication
   * is worse than no mark. So the reader places a frame over the table once — corners
   * to drag, the whole thing to move — and the six formula rows and four city columns
   * are derived from it. The frame is remembered per sheet, so it is a one-time act.
   */
  const [frame, setFrame] = useState<TableFrame>(DEFAULT_FRAME);
  const [adjusting, setAdjusting] = useState(false);
  /** Auto-levels and sharpening at view time — see enhanceScan for what it does not do. */
  const [enhanced, setEnhanced] = useState(true);
  /** Which handle is being dragged: a corner index 0-3, or 'move', or null. */
  const dragRef = useRef<{ mode: number | 'move'; startX: number; startY: number; start: TableFrame } | null>(null);
  const [currentSheetId, setCurrentSheetId] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const openViewer = async () => {
    setOpen(true);
    setIsLoading(true);
    setPdf(null);
    setSheets([]);
    setSelectedMonth(initialMonth);
    setWholeYear(false);
    try {
      const listRes = await fetch(`/api/indices/jpc-sheet?year=${year}&month=${initialMonth}`);
      const listData = await listRes.json();
      if (!listRes.ok) throw new Error(listData.error || 'Could not list sheets');
      const options: SheetOption[] = listData.sheets || [];
      setSheets(options);
      setAvailableYears(listData.availableYears || []);
      if (options.length === 0) return;
      await loadSheet(options[0]);
    } catch (err: any) {
      toast.error(`Could not open the sheet: ${err?.message || err}`);
      setOpen(false);
    } finally {
      setIsLoading(false);
    }
  };

  const loadSheet = async (sheet: SheetOption) => {
    setIsLoading(true);
    setPdf(null);
    try {
      const urlRes = await fetch('/api/indices/jpc-sheet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: sheet.id }),
      });
      const urlData = await urlRes.json();
      if (!urlRes.ok) throw new Error(urlData.error || 'Could not fetch the sheet');

      const pdfjs = (await import('pdfjs-dist')) as any;
      // A plain file on our own origin, copied from the installed package at build time
      // (scripts/copy-pdf-worker.cjs). Not a CDN — refused twice over by browsers and
      // CSP — and not bundled, which the server's pdfjs external makes webpack refuse.
      pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
      const loaded = await pdfjs.getDocument({ url: urlData.url }).promise;

      // The frame this reader last set for this sheet, if any.
      setCurrentSheetId(sheet.id);
      try {
        const saved = localStorage.getItem(frameStorageKey(sheet.id));
        setFrame(saved ? JSON.parse(saved) : DEFAULT_FRAME);
      } catch {
        setFrame(DEFAULT_FRAME);
      }

      const months = [...(sheet.months || [])].sort((a, b) => a - b);
      // Trust the slice only when the rhythm holds exactly. displayed months come from
      // the document's own tag list, so a half-year upload (36 pages, months 1–6)
      // slices correctly too.
      const fits = months.length > 0 && loaded.numPages === months.length * PAGES_PER_MONTH;
      setDocMonths(months);
      setSliced(fits);
      setWholeYear(!fits);
      setPdf(loaded);
      setPageCount(loaded.numPages);
      setPosition(1);
      if (fits && !months.includes(initialMonth)) {
        // The asked-for month is not in this document; land on its first month rather
        // than claiming pages it does not have.
        setSelectedMonth(months[0]);
      }
    } catch (err: any) {
      toast.error(`Could not load the sheet: ${err?.message || err}`);
    } finally {
      setIsLoading(false);
    }
  };

  const monthSliceStart = () => {
    const idx = docMonths.indexOf(selectedMonth);
    return idx === -1 ? 0 : idx * PAGES_PER_MONTH;
  };
  const viewLimit = sliced && !wholeYear ? PAGES_PER_MONTH : pageCount;
  const absolutePage = sliced && !wholeYear ? monthSliceStart() + position : position;

  // Draw the current page, then the viewer's identity over it.
  useEffect(() => {
    if (!pdf || !canvasRef.current || absolutePage < 1 || absolutePage > pageCount) return;
    let cancelled = false;
    (async () => {
      const page = await pdf.getPage(absolutePage);
      if (cancelled) return;
      const canvas = canvasRef.current!;
      const context = canvas.getContext('2d')!;
      const baseViewport = page.getViewport({ scale: 1 });
      // Render near the scan's own resolution. A 300 dpi A4 page carries about 2480
      // pixels across; the old target of 900 threw away nearly half of that before the
      // reader ever saw it — the detail the full-quality upload exists to preserve.
      const scale = Math.min(4, 2200 / baseViewport.width);
      const viewport = page.getViewport({ scale });
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: context, viewport }).promise;
      if (cancelled) return;

      // Before the marks and the watermark, so neither is sharpened or stretched.
      if (enhanced) enhanceScan(context, viewport.width, viewport.height);

      // The six formula rows shaded and all four city columns boxed, placed from the
      // frame the reader positioned — see the frame state above for why this is dragged
      // rather than detected.
      if (showHighlights) {
        const fx0 = frame.x0 * viewport.width;
        const fx1 = frame.x1 * viewport.width;
        const fy0 = frame.y0 * viewport.height;
        const fy1 = frame.y1 * viewport.height;
        const frameW = fx1 - fx0;
        const rowH = (fy1 - fy0) / JPC_TABLE_ROWS;
        const colX = COLUMN_FRACTIONS.map(f => fx0 + f * frameW);
        const itemSpan: [number, number] = [colX[0], colX[2]];
        const citySpans: [number, number][] = [3, 4, 5, 6].map(i => [colX[i - 1], colX[i]] as [number, number]);

        for (const row of calculationRowNumbers()) {
          const yTop = fy0 + (row.sno - 1) * rowH;
          context.fillStyle = 'rgba(255, 237, 153, 0.4)';
          context.fillRect(itemSpan[0], yTop, itemSpan[1] - itemSpan[0], rowH);
          for (const [cx0, cx1] of citySpans) {
            context.fillStyle = 'rgba(255, 217, 64, 0.35)';
            context.fillRect(cx0, yTop, cx1 - cx0, rowH);
            context.strokeStyle = 'rgba(217, 140, 0, 0.9)';
            context.lineWidth = Math.max(1, viewport.width / 900);
            context.strokeRect(cx0, yTop, cx1 - cx0, rowH);
          }
        }

        // While adjusting, show the frame itself and its corner handles, plus the row
        // guides so the reader can line them up with the printed rules exactly.
        if (adjusting) {
          context.save();
          context.strokeStyle = 'rgba(16, 122, 87, 0.95)';
          context.lineWidth = Math.max(2, viewport.width / 500);
          context.setLineDash([Math.max(6, viewport.width / 120), Math.max(4, viewport.width / 180)]);
          context.strokeRect(fx0, fy0, frameW, fy1 - fy0);
          context.setLineDash([]);
          context.strokeStyle = 'rgba(16, 122, 87, 0.35)';
          context.lineWidth = Math.max(1, viewport.width / 900);
          for (let r = 1; r < JPC_TABLE_ROWS; r++) {
            const gy = fy0 + r * rowH;
            context.beginPath();
            context.moveTo(fx0, gy);
            context.lineTo(fx1, gy);
            context.stroke();
          }
          for (const cx of colX) {
            context.beginPath();
            context.moveTo(cx, fy0);
            context.lineTo(cx, fy1);
            context.stroke();
          }
          const handle = Math.max(10, viewport.width / 60);
          context.fillStyle = 'rgba(16, 122, 87, 0.95)';
          for (const [hx, hy] of [[fx0, fy0], [fx1, fy0], [fx0, fy1], [fx1, fy1]]) {
            context.fillRect(hx - handle / 2, hy - handle / 2, handle, handle);
          }
          context.restore();
        }
      }

      // The viewer's own email, faint and diagonal — a screenshot carries its reader.
      const who = session?.user?.email || 'irpvc.in';
      context.save();
      context.globalAlpha = 0.14;
      context.fillStyle = '#1f2937';
      context.font = `${Math.round(viewport.width / 28)}px sans-serif`;
      context.translate(viewport.width / 2, viewport.height / 2);
      context.rotate(-Math.PI / 5);
      context.textAlign = 'center';
      for (const dy of [-0.3, 0, 0.3]) {
        context.fillText(`${who} — view only — irpvc.in`, 0, viewport.height * dy);
      }
      context.restore();
    })();
    return () => { cancelled = true; };
  }, [pdf, absolutePage, pageCount, session?.user?.email, showHighlights, frame, adjusting, enhanced]);

  /** Canvas coordinates as page fractions, for both mouse and touch. */
  const pointerFraction = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!adjusting) return;
    const { x, y } = pointerFraction(e);
    const corners: [number, number][] = [
      [frame.x0, frame.y0], [frame.x1, frame.y0], [frame.x0, frame.y1], [frame.x1, frame.y1],
    ];
    // Generous grab radius — this is used on phones as well as with a mouse.
    const hit = corners.findIndex(([cx, cy]) => Math.hypot(cx - x, cy - y) < 0.035);
    const inside = x > frame.x0 && x < frame.x1 && y > frame.y0 && y < frame.y1;
    if (hit === -1 && !inside) return;
    dragRef.current = { mode: hit === -1 ? 'move' : hit, startX: x, startY: y, start: { ...frame } };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const { x, y } = pointerFraction(e);
    const dx = x - drag.startX;
    const dy = y - drag.startY;
    const clamp = (v: number) => Math.min(1, Math.max(0, v));
    const next = { ...drag.start };
    if (drag.mode === 'move') {
      const w = drag.start.x1 - drag.start.x0;
      const h = drag.start.y1 - drag.start.y0;
      next.x0 = clamp(Math.min(drag.start.x0 + dx, 1 - w));
      next.y0 = clamp(Math.min(drag.start.y0 + dy, 1 - h));
      next.x0 = Math.max(0, next.x0);
      next.y0 = Math.max(0, next.y0);
      next.x1 = next.x0 + w;
      next.y1 = next.y0 + h;
    } else {
      if (drag.mode === 0 || drag.mode === 2) next.x0 = clamp(drag.start.x0 + dx);
      if (drag.mode === 1 || drag.mode === 3) next.x1 = clamp(drag.start.x1 + dx);
      if (drag.mode === 0 || drag.mode === 1) next.y0 = clamp(drag.start.y0 + dy);
      if (drag.mode === 2 || drag.mode === 3) next.y1 = clamp(drag.start.y1 + dy);
      // A frame narrower than this is a mis-drag, not an intention.
      if (next.x1 - next.x0 < 0.15 || next.y1 - next.y0 < 0.15) return;
    }
    setFrame(next);
  };

  const onPointerUp = () => {
    if (!dragRef.current) return;
    dragRef.current = null;
    // Remembered per sheet, so positioning is a one-time act per document.
    if (currentSheetId) {
      try { localStorage.setItem(frameStorageKey(currentSheetId), JSON.stringify(frame)); } catch { /* private mode */ }
    }
  };

  /** "1st fortnight · page 2 of 3" for the sliced view; plain numbering otherwise. */
  const positionLabel = () => {
    if (!(sliced && !wholeYear)) return `Page ${position} of ${pageCount}`;
    const fortnight = position <= PAGES_PER_FORTNIGHT ? '1st fortnight' : '2nd fortnight';
    const pageInFortnight = ((position - 1) % PAGES_PER_FORTNIGHT) + 1;
    return `${MONTH_NAMES[selectedMonth - 1]} ${year} — ${fortnight} · page ${pageInFortnight} of ${PAGES_PER_FORTNIGHT}`;
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={openViewer} className="gap-2">
        <FileSearch className="h-4 w-4" />
        View official sheet
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Official JPC sheet — {year}</DialogTitle>
          </DialogHeader>

          {isLoading && (
            <div className="flex items-center justify-center py-16">
              <LoadingSpinner size="lg" text="Loading the sheet..." />
            </div>
          )}

          {!isLoading && sheets.length === 0 && (
            <div className="py-8 text-center space-y-2">
              <p className="text-sm text-gray-600">
                No JPC sheet has been uploaded for {year} yet.
              </p>
              {availableYears.length > 0 && (
                <p className="text-xs text-gray-400">
                  Sheets are available for: {availableYears.join(', ')}. An admin can add {year} under
                  Component Index Documents.
                </p>
              )}
            </div>
          )}

          {pdf && (
            <div className="space-y-3">
              {/* Month chips — switching months re-slices the already-loaded year. */}
              {sliced && (
                <div className="flex flex-wrap items-center justify-center gap-1.5">
                  {docMonths.map((m) => (
                    <button
                      key={m}
                      onClick={() => { setSelectedMonth(m); setPosition(1); setWholeYear(false); }}
                      className={`px-2 py-1 rounded text-xs border ${
                        !wholeYear && m === selectedMonth
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      {MONTH_NAMES[m - 1]}
                    </button>
                  ))}
                  <button
                    onClick={() => { setWholeYear(true); setPosition(1); }}
                    className={`px-2 py-1 rounded text-xs border ${
                      wholeYear
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    Whole year
                  </button>
                </div>
              )}

              {/* Highlight controls stand apart from the month chips: those only exist
                  for documents that follow the six-pages-per-month rhythm, and a
                  document that does not is precisely the one whose shading needs
                  placing by hand. */}
              <div className="flex flex-wrap items-center justify-center gap-1.5">
                  <button
                    onClick={() => setShowHighlights(v => !v)}
                    className={`px-2 py-1 rounded text-xs border ${
                      showHighlights
                        ? 'bg-amber-500 text-white border-amber-500'
                        : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                    }`}
                    title="Shade the six items and city column the PVC steel indices use"
                  >
                    {showHighlights ? 'Highlights on' : 'Highlights off'}
                  </button>
                  <button
                    onClick={() => setEnhanced(v => !v)}
                    className={`px-2 py-1 rounded text-xs border ${
                      enhanced
                        ? 'bg-slate-700 text-white border-slate-700'
                        : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                    }`}
                    title="Stretch the scan's contrast and sharpen its strokes — display only"
                  >
                    {enhanced ? 'Sharpened' : 'Sharpen off'}
                  </button>
                  {/* Placing the frame is a one-time act per sheet, so the control is
                      quiet until it is wanted — and loud while it is on. */}
                  {showHighlights && (
                    <button
                      onClick={() => setAdjusting(v => !v)}
                      className={`px-2 py-1 rounded text-xs border ${
                        adjusting
                          ? 'bg-emerald-700 text-white border-emerald-700'
                          : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                      }`}
                      title="Drag the shading onto the table"
                    >
                      {adjusting ? 'Done' : 'Adjust'}
                    </button>
                  )}
                  {showHighlights && adjusting && (
                    <button
                      onClick={() => {
                        setFrame(DEFAULT_FRAME);
                        if (currentSheetId) {
                          try { localStorage.removeItem(frameStorageKey(currentSheetId)); } catch { /* private mode */ }
                        }
                      }}
                      className="px-2 py-1 rounded text-xs border bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                      title="Back to the default position"
                    >
                      Reset
                    </button>
                  )}
              </div>

              {!sliced && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                  This document doesn&apos;t follow the usual six-pages-per-month layout
                  ({pageCount} pages for {docMonths.length || '?'} months), so month jumping is off —
                  flip to your fortnight&apos;s page.
                </p>
              )}

              <div className="flex items-center justify-center gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={position <= 1}
                  onClick={() => setPosition((p) => p - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm text-gray-600">{positionLabel()}</span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={position >= viewLimit}
                  onClick={() => setPosition((p) => p + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>

              {/* No download control anywhere in this dialog, and the context menu is
                  quieted — a deterrent in keeping with how these sheets circulate. */}
              <canvas
                ref={canvasRef}
                onContextMenu={(e) => e.preventDefault()}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                className={`w-full h-auto border rounded shadow-sm ${adjusting ? 'cursor-move touch-none' : ''}`}
              />
              <p className="text-[11px] text-gray-400 text-center">
                {showHighlights && (
                  <span className="block">
                    Shaded: the six items the steel indices are built from under GCC 46A.9(1),
                    across all four cities. {adjusting
                      ? 'Drag the green corners onto the table\u2019s own edges — row one\u2019s top to row twenty-four\u2019s bottom — then press Done.'
                      : 'If the shading sits off the table, press Adjust and drag it into place; the position is remembered for this sheet.'}
                  </span>
                )}
                JPC Market Price (Retail) — © Joint Plant Committee. Shown for verifying rates
                against your bill; not for redistribution.
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
