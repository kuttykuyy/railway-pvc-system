'use client';

import { useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { ChevronLeft, ChevronRight, FileSearch } from 'lucide-react';
import toast from 'react-hot-toast';

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
  }, [pdf, absolutePage, pageCount, session?.user?.email]);

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
