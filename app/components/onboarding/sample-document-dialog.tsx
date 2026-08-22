'use client';

/**
 * "What does an LOA / a signed bill look like?" — a sample of each document, shown
 * where the upload is asked for.
 *
 * The first thing a new user is unsure of is not how to upload but WHICH PDF is meant:
 * IREPS hands a contractor several documents, and a tender schedule, a work order or a
 * measurement book will all fail to read. One real page of each, with the parts that
 * matter pointed out, answers that before the wrong file is tried.
 *
 * The pages are images (public/samples), not PDFs: they load in a moment on a phone,
 * need no viewer, and the firm's name, address and the signers' names on the originals
 * are covered — the page is public.
 */

import { useState } from 'react';
import { Eye } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

type SampleKind = 'loa' | 'bill';

interface SamplePage {
  src: string;
  width: number;
  height: number;
  title: string;
  notes: string[];
}

const SAMPLES: Record<SampleKind, { title: string; intro: string; pages: SamplePage[] }> = {
  loa: {
    title: 'What an LOA looks like',
    intro:
      'The Letter of Acceptance, as published on IREPS. Upload the whole PDF, every page — the app reads only the pages it needs.',
    pages: [
      {
        src: '/samples/loa-page-1.jpg',
        width: 1000,
        height: 1294,
        title: 'Page 1',
        notes: [
          '"Sub: Letter Of Acceptance" near the top — that is how you know it is the right document.',
          'The Letter No. ends in the LOA number (a long figure such as 10699560129108). The app reads it for you.',
          'The tender number, closing date and contract value are read from here too.',
          'An LOA usually does not print the agreement number — leave that blank; your first bill supplies it.',
        ],
      },
    ],
  },
  bill: {
    title: 'What a signed bill looks like',
    intro:
      'The signed bill PDF downloaded from IREPS / IR-WCMS. Upload it as it is — the cover page and all the item pages. Do not remove pages: the app checks its own total against the bill’s printed total.',
    pages: [
      {
        src: '/samples/bill-page-1.jpg',
        width: 1200,
        height: 848,
        title: 'Page 1 — Bill Basic Details',
        notes: [
          'The bill number and Agreement No. at the top — this is where the agreement number comes from.',
          'LOA No. and the Measurement Date From / To are read from this table.',
          'The digital signatures at the bottom are what make it a signed bill.',
        ],
      },
      {
        src: '/samples/bill-items.jpg',
        width: 1200,
        height: 848,
        title: 'Page 2 onwards — Item wise Bill Details',
        notes: [
          'One row per item: unit, rate, quantity, the amount since the last bill, and a payment remark.',
          'Every item row is read; the schedule totals are used to check the reading against the bill itself.',
        ],
      },
    ],
  },
};

export function SampleDocumentDialog({
  kind,
  label,
  className,
}: {
  kind: SampleKind;
  /** The link text. Defaults to a short "See a sample …". */
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const sample = SAMPLES[kind];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          className ||
          'inline-flex items-center gap-2 mt-1 px-3 py-1.5 rounded-md border border-emerald-300 bg-emerald-50 text-base font-semibold text-emerald-800 hover:bg-emerald-100'
        }
      >
        <Eye className="h-5 w-5" />
        {label || (kind === 'loa' ? 'See a sample LOA' : 'See a sample bill')}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        {/* z-[70]: the bill page's instant cover is a fixed z-[60] sheet, and the dialog
            default (z-50) opened behind it — the link appeared to do nothing. */}
        {/* Nearly the whole viewport: the point is to READ the page, and at the dialog's
            default width a bill page was a thumbnail. */}
        <DialogContent className="z-[70] w-[96vw] max-w-[1400px] max-h-[94vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{sample.title}</DialogTitle>
            <DialogDescription>{sample.intro}</DialogDescription>
          </DialogHeader>

          <div className="space-y-8">
            {sample.pages.map((page) => (
              <figure key={page.src} className="space-y-3">
                <figcaption className="text-sm font-semibold">{page.title}</figcaption>
                <div className="rounded-md border bg-muted/30 p-2 overflow-x-auto">
                  {/* Plain <img>: these are static files with known sizes, and the
                      dialog must work without image-optimisation config. */}
                  <img
                    src={page.src}
                    width={page.width}
                    height={page.height}
                    alt={`${sample.title} — ${page.title}`}
                    className="w-full h-auto rounded-sm shadow-sm"
                    loading="lazy"
                  />
                </div>
                <ul className="text-sm text-muted-foreground space-y-1 list-disc pl-5">
                  {page.notes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              </figure>
            ))}
          </div>

          <p className="text-xs text-muted-foreground border-t pt-3">
            Sample pages from a real contract; the firm&apos;s name, address and the signers&apos;
            names are covered. Your own documents will look the same with your details in place.
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}
