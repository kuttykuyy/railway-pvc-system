'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, ClipboardCheck, Layers, Save, ScanSearch, Upload } from 'lucide-react';

/**
 * What is happening to the bill while the cover says "Reading your bill…".
 *
 * The reading endpoint answers once, when everything is done, so there is no true
 * progress to show. What there is: a fixed sequence of steps that every bill goes
 * through, and a typical duration for each. The track below advances on elapsed time
 * through those steps, and the caption under it explains the step in one line — so the
 * wait teaches the person what the system does with their bill instead of showing a
 * spinner. A parsed bill is back in a second or two; one the parser could not read is
 * handed to the AI reader and takes a minute or two, and past ten seconds the copy
 * says so rather than leaving the track stuck on "checking".
 */

type Phase = 'reading' | 'saving';

interface Step {
  key: string;
  label: string;
  caption: string;
  /** Seconds since start at which the step is considered done. */
  doneAt: number;
  Icon: typeof Upload;
}

const STEPS: Step[] = [
  { key: 'upload', label: 'Upload', caption: 'Your signed IREPS PDF reaches the server.', doneAt: 1, Icon: Upload },
  { key: 'read', label: 'Read items', caption: 'Every payable row is read: item number, quantity since last bill, agreement rate, amount.', doneAt: 3, Icon: ScanSearch },
  { key: 'check', label: 'Check totals', caption: "The rows are added up and matched to the bill's own printed total, to the paisa.", doneAt: 5, Icon: ClipboardCheck },
  { key: 'classify', label: 'Classify', caption: 'Each item is placed under its GCC 46A group so the right price indices apply.', doneAt: 7, Icon: Layers },
  { key: 'save', label: 'Report', caption: 'The bill is saved and the PVC report is on its way. The download starts by itself.', doneAt: 9, Icon: Save },
];

const FACTS = [
  'PVC pays for price movement after the tender: labour, cement, steel, fuel and other materials each follow their own published index.',
  'Only the "Qty executed since last Bill" column is priced. Cumulative columns on the bill are read but never charged.',
  'Steel is priced by category under Clause 46A.9: TMT bars, angles and channels, plates, and other sections each use their own JPC index.',
  'Cement paid separately under a supply item is not "cement-affected work", so it does not attract the DSR cement coefficient.',
  'A bill measured after the completion date needs the time extension recorded first, because Clause 17B caps the indices for that period.',
  'The reader checks itself: if the rows do not add up to the printed total, the bill is not saved and you are told why.',
];

export function BillReadingInfographic({ phase }: { phase: Phase }) {
  const [elapsed, setElapsed] = useState(0);
  const [fact, setFact] = useState(0);

  useEffect(() => {
    const startedAt = Date.now();
    const tick = setInterval(() => setElapsed((Date.now() - startedAt) / 1000), 250);
    const rotate = setInterval(() => setFact((i) => (i + 1) % FACTS.length), 6000);
    return () => { clearInterval(tick); clearInterval(rotate); };
  }, []);

  // While reading, the track never passes "classify": saving is the page's own step,
  // and it is shown done only when the page says it is saving.
  const cap = phase === 'saving' ? STEPS.length : STEPS.length - 1;
  const doneCount = Math.min(cap, STEPS.filter((s) => elapsed >= s.doneAt).length);
  const activeIndex = phase === 'saving' ? STEPS.length - 1 : Math.min(doneCount, STEPS.length - 2);
  const slow = phase === 'reading' && elapsed > 10;
  const active = STEPS[activeIndex];

  return (
    <div className="space-y-6" aria-live="polite">
      {/* The track */}
      <ol className="flex items-start justify-between gap-1" aria-label="Bill reading steps">
        {STEPS.map((step, index) => {
          const done = index < doneCount || (phase === 'saving' && index < STEPS.length - 1);
          const isActive = index === activeIndex && !done;
          const Icon = done ? CheckCircle2 : step.Icon;
          return (
            <li key={step.key} className="flex-1 flex flex-col items-center text-center min-w-0">
              <div className="relative w-full flex items-center justify-center">
                {index > 0 && (
                  <span
                    className={`absolute right-1/2 left-[-50%] top-1/2 h-0.5 -translate-y-1/2 transition-colors duration-500 ${
                      done || isActive ? 'bg-emerald-500' : 'bg-slate-200 dark:bg-slate-700'
                    }`}
                    aria-hidden
                  />
                )}
                <span
                  className={`relative z-10 flex h-10 w-10 items-center justify-center rounded-full border-2 transition-all duration-500 ${
                    done
                      ? 'border-emerald-500 bg-emerald-500 text-white'
                      : isActive
                        ? 'border-emerald-500 bg-white text-emerald-600 shadow-[0_0_0_6px_rgba(16,185,129,0.15)] dark:bg-slate-900'
                        : 'border-slate-200 bg-white text-slate-400 dark:border-slate-700 dark:bg-slate-900'
                  }`}
                >
                  <Icon className={`h-5 w-5 ${isActive ? 'animate-pulse' : ''}`} />
                </span>
              </div>
              <span
                className={`mt-2 text-[11px] font-semibold leading-tight ${
                  done || isActive ? 'text-slate-900 dark:text-slate-100' : 'text-slate-400'
                }`}
              >
                {step.label}
              </span>
            </li>
          );
        })}
      </ol>

      {/* What the active step is doing */}
      <div className="min-h-[3.5rem]">
        <h2 className="text-xl font-bold">
          {phase === 'saving' ? 'Preparing your report…' : slow ? 'Reading this one closely…' : `${active.label}…`}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {phase === 'saving'
            ? STEPS[STEPS.length - 1].caption
            : slow
              ? 'The quick reader could not reconcile this PDF, so the AI reader is going through it page by page. That usually takes a minute or two. Nothing is saved until the totals match.'
              : active.caption}
        </p>
      </div>

      {/* Something worth knowing while waiting */}
      <div className="rounded-lg border border-emerald-100 bg-emerald-50/60 p-4 text-left dark:border-emerald-900 dark:bg-emerald-950/30">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">How PVC works</p>
        <p key={fact} className="mt-1 text-sm text-slate-700 dark:text-slate-200 animate-in fade-in duration-500">
          {FACTS[fact]}
        </p>
      </div>

      <p className="text-xs text-slate-400 tabular-nums">{Math.floor(elapsed)}s elapsed</p>
    </div>
  );
}
