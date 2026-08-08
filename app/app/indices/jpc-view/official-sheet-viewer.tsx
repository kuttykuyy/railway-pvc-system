'use client';

import { useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { ChevronLeft, ChevronRight, FileSearch } from 'lucide-react';
import toast from 'react-hot-toast';

/**
 * The official JPC sheet, readable beside the extracted numbers.
 *
 * The table on this page shows what the app read off the sheet; matching a rate means
 * seeing it ON the sheet. This renders the uploaded document to canvas — no download
 * button, no file link in the page, a short-lived URL behind it, and the viewer's own
 * email drawn across each page. Deterrents, not locks: nothing a browser can show is
 * truly undownloadable. The aim is to keep the sheet readable against a claim without
 * turning the app into a redistribution channel for a paid publication.
 */

interface SheetOption {
  id: string;
  fileName: string;
  months: number[];
  coversMonth: boolean;
}

export function OfficialSheetViewer({ month }: { month: string }) {
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [sheets, setSheets] = useState<SheetOption[]>([]);
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [pdf, setPdf] = useState<any>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [year, monthNum] = month.split('-').map((v) => parseInt(v, 10));

  const openViewer = async () => {
    setOpen(true);
    setIsLoading(true);
    setPdf(null);
    setSheets([]);
    try {
      const listRes = await fetch(`/api/indices/jpc-sheet?year=${year}&month=${monthNum}`);
      const listData = await listRes.json();
      if (!listRes.ok) throw new Error(listData.error || 'Could not list sheets');
      const options: SheetOption[] = listData.sheets || [];
      setSheets(options);
      setAvailableYears(listData.availableYears || []);
      if (options.length === 0) return;
      await loadSheet(options[0].id);
    } catch (err: any) {
      toast.error(`Could not open the sheet: ${err?.message || err}`);
      setOpen(false);
    } finally {
      setIsLoading(false);
    }
  };

  const loadSheet = async (id: string) => {
    setIsLoading(true);
    setPdf(null);
    try {
      const urlRes = await fetch('/api/indices/jpc-sheet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const urlData = await urlRes.json();
      if (!urlRes.ok) throw new Error(urlData.error || 'Could not fetch the sheet');

      const pdfjs = (await import('pdfjs-dist')) as any;
      // The worker ships with the app and is served from our own origin. A CDN copy is
      // doubly dead on arrival: cross-origin workers are refused by the browser, and the
      // fallback import of the same URL is refused by our CSP.
      pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
      const loaded = await pdfjs.getDocument({ url: urlData.url }).promise;
      setPdf(loaded);
      setPageCount(loaded.numPages);
      setPageNumber(1);
    } catch (err: any) {
      toast.error(`Could not load the sheet: ${err?.message || err}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Draw the current page, then the viewer's identity over it.
  useEffect(() => {
    if (!pdf || !canvasRef.current) return;
    let cancelled = false;
    (async () => {
      const page = await pdf.getPage(pageNumber);
      if (cancelled) return;
      const canvas = canvasRef.current!;
      const context = canvas.getContext('2d')!;
      // Scale to a readable width; the dialog scrolls vertically.
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
  }, [pdf, pageNumber, session?.user?.email]);

  return (
    <>
      <Button variant="outline" size="sm" onClick={openViewer} className="gap-2">
        <FileSearch className="h-4 w-4" />
        View official sheet
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Official JPC sheet — {month}</DialogTitle>
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
              {/* Which years exist is the difference between "broken" and "not yet
                  uploaded" — say it. */}
              {availableYears.length > 0 && (
                <p className="text-xs text-gray-400">
                  Sheets are available for: {availableYears.join(', ')}. An admin can add {year} under
                  Component Index Documents.
                </p>
              )}
            </div>
          )}

          {!isLoading && sheets.length > 0 && !sheets[0].coversMonth && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
              No sheet is tagged for this exact month — showing the year&apos;s sheet. Flip to your
              fortnight&apos;s page.
            </p>
          )}

          {pdf && (
            <div className="space-y-3">
              <div className="flex items-center justify-center gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pageNumber <= 1}
                  onClick={() => setPageNumber((p) => p - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm text-gray-600">
                  Page {pageNumber} of {pageCount}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pageNumber >= pageCount}
                  onClick={() => setPageNumber((p) => p + 1)}
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
