'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, FileText, Hash, CalendarClock, Layers, IndianRupee } from 'lucide-react';

/**
 * What is happening to the LOA while the welcome page says "Reading…".
 *
 * The extract endpoint answers once, when it is done, so there is no true progress to
 * show. What there is: the fixed set of things read off every LOA, and a rough time for
 * each. The track advances on elapsed time, the caption names the step in one line, and
 * a rotating note teaches a little about how the contract feeds PVC — so the wait shows
 * the person what the app is doing instead of a spinner. A scanned LOA can take longer;
 * past twelve seconds the copy says the reader is going through it closely.
 */

interface Step {
  key: string;
  label: string;
  caption: string;
  /** Seconds since start at which the step is considered done. */
  doneAt: number;
  Icon: typeof FileText;
}

const STEPS: Step[] = [
  { key: 'open', label: 'Open', caption: 'Your LOA PDF reaches the server and the opening pages are read.', doneAt: 1, Icon: FileText },
  { key: 'numbers', label: 'Numbers', caption: 'The agreement and LOA numbers, and the tender opening date.', doneAt: 3, Icon: Hash },
  { key: 'base', label: 'Base month', caption: 'The month before the tender opened — the base every price index is measured from.', doneAt: 5, Icon: CalendarClock },
  { key: 'schedules', label: 'Schedules', caption: 'Each schedule, its items and the agreement rates, picked up in one pass.', doneAt: 7, Icon: Layers },
  { key: 'value', label: 'Value', caption: 'The accepted contract value and the completion period.', doneAt: 9, Icon: IndianRupee },
];

const FACTS = [
  'The base month is the month before the tender opened — every price index is measured against it.',
  'PVC is worked under GCC 2022 Clause 46A: labour, cement, steel, fuel and other materials each move with their own index.',
  'An LOA rarely carries the agreement number — it is issued weeks before the agreement is signed. Your first bill prints it, and we take it from there.',
  'Rates are read straight from the schedules, so every bill is checked against the contract instead of being retyped.',
  'Reading the LOA and creating the contract is free. You only pay when a bill’s PVC report is made — and the first one is on us.',
];

export function AgreementReadingInfographic() {
  const [elapsed, setElapsed] = useState(0);
  const [fact, setFact] = useState(0);

  useEffect(() => {
    const startedAt = Date.now();
    const tick = setInterval(() => setElapsed((Date.now() - startedAt) / 1000), 250);
    const rotate = setInterval(() => setFact((i) => (i + 1) % FACTS.length), 5000);
    return () => { clearInterval(tick); clearInterval(rotate); };
  }, []);

  // Never let the track show the last step done — the answer landing is what ends it.
  const doneCount = Math.min(STEPS.length - 1, STEPS.filter((s) => elapsed >= s.doneAt).length);
  const activeIndex = Math.min(doneCount, STEPS.length - 1);
  const slow = elapsed > 12;
  const active = STEPS[activeIndex];

  return (
    <div className="space-y-5 mt-4" aria-live="polite">
      {/* The track */}
      <ol className="flex items-start justify-between gap-1" aria-label="LOA reading steps">
        {STEPS.map((step, index) => {
          const done = index < doneCount;
          const isActive = index === activeIndex && !done;
          const Icon = done ? CheckCircle2 : step.Icon;
          return (
            <li key={step.key} className="flex-1 flex flex-col items-center text-center min-w-0">
              <div className="relative w-full flex items-center justify-center">
                {index > 0 && (
                  <span
                    className={`absolute right-1/2 left-[-50%] top-1/2 h-0.5 -translate-y-1/2 transition-colors duration-500 ${
                      done || isActive ? 'bg-emerald-500' : 'bg-slate-200'
                    }`}
                    aria-hidden
                  />
                )}
                <span
                  className={`relative z-10 flex h-9 w-9 items-center justify-center rounded-full border-2 transition-all duration-500 ${
                    done
                      ? 'border-emerald-500 bg-emerald-500 text-white'
                      : isActive
                        ? 'border-emerald-500 bg-white text-emerald-600 shadow-[0_0_0_6px_rgba(16,185,129,0.15)]'
                        : 'border-slate-200 bg-white text-slate-400'
                  }`}
                >
                  <Icon className={`h-[18px] w-[18px] ${isActive ? 'animate-pulse' : ''}`} />
                </span>
              </div>
              <span
                className={`mt-2 text-[10.5px] font-semibold leading-tight ${
                  done || isActive ? 'text-slate-900' : 'text-slate-400'
                }`}
              >
                {step.label}
              </span>
            </li>
          );
        })}
      </ol>

      {/* What the active step is doing */}
      <div className="min-h-[3rem]">
        <p className="text-base font-bold">{slow ? 'Reading this one closely…' : `${active.label}…`}</p>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {slow
            ? 'This LOA is taking a little longer to read — often a scanned copy. Hang on; nothing is saved until it is read.'
            : active.caption}
        </p>
      </div>

      {/* Something worth knowing while waiting */}
      <div className="rounded-lg border border-emerald-100 bg-emerald-50/60 p-3.5 text-left">
        <p className="text-[10.5px] font-semibold uppercase tracking-wide text-emerald-700">Good to know</p>
        <p key={fact} className="mt-1 text-sm text-slate-700 animate-in fade-in duration-500">{FACTS[fact]}</p>
      </div>

      <p className="text-xs text-slate-400 tabular-nums">{Math.floor(elapsed)}s elapsed</p>
    </div>
  );
}
