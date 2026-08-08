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
 * Find the JPC price table on the rendered page by its own ruled lines.
 *
 * Fixed templates mark by remembered positions, and every scan crop moves those a
 * little — the misalignments users saw. The lines are right there in the pixels, so
 * read them: seven vertical rules (table edge, Sl.No, ITEM, four cities) and the row
 * separators between them. Detection doubles as the page filter — a fortnight's second
 * page (a ten-row table) and third page (a disclaimer) simply fail to yield a 24-row
 * grid, so only the page that actually carries the 24 items gets marks.
 *
 * Returns null when no confident grid is found; the caller draws nothing then.
 */
export function detectJpcGrid(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
): { rowLines: number[]; colRules: number[]; angle: number; fail?: undefined } | { fail: string } {
  try {
    const raw = context.getImageData(0, 0, width, height).data;
    // Luminance, not the red channel alone — a raw scan often carries a colour cast,
    // and grey or bluish ink can vanish in red while the yellowed paper glows.
    const lum = new Uint8Array(width * height);
    for (let i = 0, j = 0; j < lum.length; i += 4, j++) {
      lum[j] = (raw[i] * 77 + raw[i + 1] * 150 + raw[i + 2] * 29) >> 8;
    }
    const cluster = (points: number[], gap: number) => {
      const groups: number[][] = [];
      for (const p of points) {
        const last = groups[groups.length - 1];
        if (last && p - last[last.length - 1] <= gap) last.push(p);
        else groups.push([p]);
      }
      return groups.map(g => g[Math.floor(g.length / 2)]);
    };

    const bandTop = Math.floor(0.15 * height);
    const bandBottom = Math.floor(0.95 * height);
    const bandSize = bandBottom - bandTop;

    // The cut-off between paper and ink is read off the page's own histogram (Otsu) —
    // contrast is a property of the scan, not of the table.
    const histogram = new Array(256).fill(0);
    let sampled = 0;
    for (let y = bandTop; y < bandBottom; y += 2) {
      for (let x = 0; x < width; x += 2) {
        histogram[lum[y * width + x]]++;
        sampled++;
      }
    }
    let sumAll = 0;
    for (let i = 0; i < 256; i++) sumAll += i * histogram[i];
    let sumBelow = 0, countBelow = 0, bestVar = 0, otsu = 160;
    for (let t = 0; t < 256; t++) {
      countBelow += histogram[t];
      if (countBelow === 0 || countBelow === sampled) continue;
      sumBelow += t * histogram[t];
      const meanBelow = sumBelow / countBelow;
      const meanAbove = (sumAll - sumBelow) / (sampled - countBelow);
      const between = countBelow * (sampled - countBelow) * (meanBelow - meanAbove) ** 2;
      if (between > bestVar) { bestVar = between; otsu = t; }
    }
    const threshold = Math.min(230, Math.max(100, otsu));

    // ---- The scan's tilt, before anything else ----
    // A tilted vertical rule never stays in one pixel column, so column-by-column
    // scanning sees nothing (a real page failed with rules=1 on a visibly skewed scan).
    // Project the dark pixels onto a rotated axis for each candidate angle: at the
    // scan's true tilt the rules stack into a few tall bins; at every other angle they
    // smear. The sharpest projection names the angle; everything after works in the
    // de-rotated frame, and the caller draws the marks rotated back.
    const cx = width / 2, cy = height / 2;
    const darkPts: number[] = [];
    for (let y = bandTop; y < bandBottom; y += 3) {
      for (let x = 0; x < width; x++) {
        if (lum[y * width + x] < threshold) darkPts.push(x, y);
      }
    }
    let angle = 0, bestScore = -1;
    for (let deg = -3; deg <= 3.01; deg += 0.5) {
      const th = (deg * Math.PI) / 180;
      const cos = Math.cos(th), sin = Math.sin(th);
      const bins = new Float64Array(width);
      for (let i = 0; i < darkPts.length; i += 2) {
        const u = (darkPts[i] - cx) * cos + (darkPts[i + 1] - cy) * sin + cx;
        if (u >= 0 && u < width) bins[u | 0]++;
      }
      const sorted = Array.from(bins).sort((a, b) => b - a);
      let score = 0;
      for (let k = 0; k < 12; k++) score += sorted[k];
      if (score > bestScore) { bestScore = score; angle = th; }
    }
    const cosA = Math.cos(angle), sinA = Math.sin(angle);
    // Content frame (u,v) → pixel: rotate by the found angle about the page centre.
    const darkAt = (u: number, v: number) => {
      const x = Math.round((u - cx) * cosA - (v - cy) * sinA + cx);
      const y = Math.round((u - cx) * sinA + (v - cy) * cosA + cy);
      if (x < 0 || x >= width || y < 0 || y >= height) return false;
      return lum[y * width + x] < threshold;
    };

    // Vertical rules, by DENSITY in the de-rotated frame — a photocopied line is broken
    // into pieces, but its column stays far darker than any text column. The bar is set
    // RELATIVE to the page's own strongest column: on a full-page table the rules score
    // ~0.8 of the band, on the newer sheets whose table fills half the page ~0.4 — a
    // fixed bar either floods with text columns or sees nothing. All rules score alike,
    // text columns score far below them, whatever the table's height.
    const densities = new Float64Array(width);
    let maxDensity = 0;
    for (let u = 0; u < width; u++) {
      let dark = 0;
      for (let v = bandTop; v < bandBottom; v++) if (darkAt(u, v)) dark++;
      densities[u] = dark / bandSize;
      if (densities[u] > maxDensity) maxDensity = densities[u];
    }
    if (maxDensity < 0.25) {
      return { fail: 'no-vlines thr=' + threshold + ' tilt=' + (angle * 180 / Math.PI).toFixed(1) };
    }
    const ruleBar = 0.6 * maxDensity;
    const vCandidates: number[] = [];
    for (let u = 0; u < width; u++) if (densities[u] > ruleBar) vCandidates.push(u);
    const colRules = cluster(vCandidates, Math.max(3, width / 300));
    if (colRules.length < 6 || colRules.length > 7) {
      return { fail: 'rules=' + colRules.length + ' thr=' + threshold + ' tilt=' + (angle * 180 / Math.PI).toFixed(1) };
    }

    // Each rule's LONGEST gap-tolerant dark segment is the rule itself; its ends bound
    // the table (walking from the first dark pixel instead strays into header text).
    const gapTolerance = Math.max(6, 0.02 * height);
    const ruleSegment = (u: number) => {
      const dark3 = (v: number) => darkAt(u, v) || darkAt(u - 1, v) || darkAt(u + 1, v);
      let bestStart = bandTop, bestEnd = bandTop;
      let segStart = -1, lastDark = -1;
      for (let v = bandTop; v <= bandBottom; v++) {
        const isDark = v < bandBottom && dark3(v);
        if (isDark) {
          if (segStart === -1) segStart = v;
          lastDark = v;
        } else if (segStart !== -1 && (v - lastDark > gapTolerance || v === bandBottom)) {
          if (lastDark - segStart > bestEnd - bestStart) { bestStart = segStart; bestEnd = lastDark; }
          segStart = -1;
        }
      }
      return { top: bestStart, bottom: bestEnd };
    };
    const segments = colRules.map(ruleSegment);
    const median = (values: number[]) => values.sort((a, b) => a - b)[Math.floor(values.length / 2)];
    const tableTop = median(segments.map(s => s.top));
    const tableBottom = median(segments.map(s => s.bottom));

    // Horizontal lines inside the table's own vertical extent, in the same frame.
    const x0 = colRules[0], x1 = colRules[colRules.length - 1];
    const hCandidates: number[] = [];
    for (let v = Math.max(bandTop, tableTop - 4); v < tableBottom; v++) {
      let dark = 0;
      for (let u = x0; u < x1; u += 2) if (darkAt(u, v)) dark++;
      if (dark / ((x1 - x0) / 2) > 0.5) hCandidates.push(v);
    }
    const strongLines = cluster(hCandidates, Math.max(3, height / 400));
    if (strongLines.length === 0) return { fail: 'no-hlines thr=' + threshold };

    // The header separator must EARN the job of "top of row 1": the 24-row grid its
    // position implies has to be the grid the surviving separators actually agree with.
    const upperLimit = tableTop + 0.35 * (tableBottom - tableTop);
    const candidates = strongLines.filter(line => line <= upperLimit);
    let best: { row1Top: number; pitch: number; score: number } | null = null;
    for (const candidate of candidates) {
      const pitch = (tableBottom - candidate) / JPC_TABLE_ROWS;
      if (pitch < 0.012 * height || pitch > 0.035 * height) continue;
      const below = strongLines.filter(line => line > candidate);
      if (below.length === 0) continue;
      const fitting = below.filter(line => {
        const k = (line - candidate) / pitch;
        return Math.abs(k - Math.round(k)) <= 0.25;
      }).length;
      const score = fitting / below.length;
      if (!best || score > best.score) best = { row1Top: candidate, pitch, score };
    }
    if (!best || best.score < 0.6) return { fail: 'fit=' + (best ? best.score.toFixed(2) : 'none') + ' thr=' + threshold };

    const rowLines = Array.from({ length: JPC_TABLE_ROWS + 1 }, (_, k) => best!.row1Top + k * best!.pitch);
    return { rowLines, colRules, angle };
  } catch (err: any) {
    return { fail: `error ${String(err?.message || err).slice(0, 40)}` };
  }
}

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
  /** Why the current page has no marks — shown in the dialog so failures are reportable. */
  const [detectNote, setDetectNote] = useState<string | null>(null);
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
      const scale = Math.min(2, 900 / baseViewport.width) * (window.devicePixelRatio > 1 ? 1.5 : 1);
      const viewport = page.getViewport({ scale });
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: context, viewport }).promise;
      if (cancelled) return;

      // The six formula rows shaded and all four city columns boxed — placed by the
      // page's OWN ruled lines, so alignment cannot drift with the scan's crop. Pages
      // without the 24-row table (each fortnight's items-25-34 page and its disclaimer
      // page) fail detection and stay clean.
      if (showHighlights) {
        const grid = detectJpcGrid(context, viewport.width, viewport.height);
        if ('rowLines' in grid) {
          setDetectNote(null);
          const { rowLines, colRules } = grid;
          // The grid was found in the de-rotated frame; draw under the same rotation so
          // the marks lie along the scan's own tilted lines.
          context.save();
          context.translate(viewport.width / 2, viewport.height / 2);
          context.rotate(grid.angle);
          context.translate(-viewport.width / 2, -viewport.height / 2);
          // Rules, left to right: table edge | Sl.No | ITEM | Kolkata | Delhi | Mumbai |
          // Chennai. With the right edge detected there are 7; with 6, the last city's
          // right edge is a column-width beyond the last rule.
          const rules = [...colRules];
          if (rules.length === 6) rules.push(rules[5] + (rules[5] - rules[4]));
          const itemSpan: [number, number] = [rules[0], rules[2]];
          const citySpans: [number, number][] = [3, 4, 5, 6].map(i => [rules[i - 1], rules[i]] as [number, number]);
          for (const row of calculationRowNumbers()) {
            const yTop = rowLines[row.sno - 1];
            const h = rowLines[row.sno] - yTop;
            context.fillStyle = 'rgba(255, 237, 153, 0.4)';
            context.fillRect(itemSpan[0], yTop, itemSpan[1] - itemSpan[0], h);
            for (const [cx0, cx1] of citySpans) {
              context.fillStyle = 'rgba(255, 217, 64, 0.35)';
              context.fillRect(cx0, yTop, cx1 - cx0, h);
              context.strokeStyle = 'rgba(217, 140, 0, 0.9)';
              context.lineWidth = Math.max(1, viewport.width / 900);
              context.strokeRect(cx0, yTop, cx1 - cx0, h);
            }
          }
          context.restore();
        } else {
          // Why marks are absent, for the dialog to say — a page without the 24-item
          // table is normal; a first page failing is a bug report in miniature.
          setDetectNote(grid.fail);
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
  }, [pdf, absolutePage, pageCount, session?.user?.email, showHighlights]);

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
                </div>
              )}

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
                className="w-full h-auto border rounded shadow-sm"
              />
              <p className="text-[11px] text-gray-400 text-center">
                {showHighlights && !detectNote && (
                  <span className="block">
                    Shaded: the six items used for the steel indices under GCC 46A.9(1), across all
                    four cities, found by the sheet&apos;s own table lines. Marks are a reading aid;
                    the figures are the sheet&apos;s own.
                  </span>
                )}
                {showHighlights && detectNote && (
                  <span className="block text-amber-600">
                    No marks on this page — the 24-item table was not recognised ({detectNote}).
                    Normal for a fortnight&apos;s 2nd and 3rd pages; on a price page, please report
                    this line.
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
