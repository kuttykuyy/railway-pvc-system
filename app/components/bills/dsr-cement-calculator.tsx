'use client';

import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FileText, RotateCcw } from 'lucide-react';
import { findScheduleRates } from '@/lib/contract-schedules';

export interface CementSchedule {
  name: string;
  affectedItemCount: number;
  cementQtyMT: number;
}

interface ScheduleSetting {
  escalation: string;
  bidRate: string;
  rebate: string;
}

const DEFAULT_DSR_BASE_RATE = 688.45;

const money = (n: number) =>
  Number.isFinite(n) ? n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-';

/**
 * DSR 5.35 cement-rate calculator for the MANUAL bill form. Given cement-affected
 * schedules with their cement quantity (MT) — derived server-side from the bill's
 * item DSR codes — it derives the cement rate (base -> escalation -> bid -> rebate)
 * and the total cement cost, then applies it to the bill's cement amount.
 */
export function DsrCementCalculator({
  schedules,
  contractId,
  contractSchedules,
  contractRebate,
  onApply,
}: {
  schedules: CementSchedule[];
  contractId?: string;
  /** Raw Contract.schedules — supplies the agreed escalation/bid rate per schedule. */
  contractSchedules?: unknown;
  /** Contract.rebatePercentage — agreed once for the whole agreement. */
  contractRebate?: number | null;
  onApply: (amount: number) => void;
}) {
  const [baseRate, setBaseRate] = useState(DEFAULT_DSR_BASE_RATE);
  const [settings, setSettings] = useState<Record<string, ScheduleSetting>>({});

  const storageKey = `irpvc:cement-rate-settings:${contractId || 'default'}`;

  // Load any saved rate settings for this contract.
  useEffect(() => {
    try {
      const raw = typeof window !== 'undefined' ? window.localStorage.getItem(storageKey) : null;
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.baseRate) setBaseRate(Number(parsed.baseRate) || DEFAULT_DSR_BASE_RATE);
        if (parsed?.settings) setSettings(parsed.settings);
      }
    } catch {
      /* ignore */
    }
  }, [storageKey]);

  // Ensure every schedule has an entry, prefilled from the CONTRACT: escalation and bid
  // rate are agreed per schedule, the rebate once for the whole agreement. The user
  // enters them on the contract; anything typed here is only a per-bill override.
  useEffect(() => {
    const agreedRebate = contractRebate != null ? String(contractRebate) : '';
    setSettings((prev) => {
      const next = { ...prev };
      for (const s of schedules) {
        const existing = next[s.name];
        const isEmpty = !existing || (!existing.escalation && !existing.bidRate && !existing.rebate);
        if (isEmpty) {
          const agreed = findScheduleRates(contractSchedules, s.name);
          next[s.name] = {
            escalation: agreed?.escalation ?? '',
            bidRate: agreed?.bidRate ?? '',
            rebate: agreedRebate,
          };
        }
      }
      return next;
    });
  }, [schedules, contractSchedules, contractRebate]);

  const persist = (nextBase: number, nextSettings: Record<string, ScheduleSetting>) => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify({ baseRate: nextBase, settings: nextSettings }));
    } catch {
      /* ignore */
    }
  };

  const setField = (sched: string, field: keyof ScheduleSetting, value: string) => {
    setSettings((prev) => {
      const next = { ...prev, [sched]: { ...(prev[sched] || { escalation: '', bidRate: '', rebate: '' }), [field]: value } };
      persist(baseRate, next);
      return next;
    });
  };

  const derivedRates = (sched: string) => {
    const s = settings[sched] || { escalation: '', bidRate: '', rebate: '' };
    const esc = parseFloat(s.escalation) || 0;
    const bid = parseFloat(s.bidRate) || 0;
    const reb = parseFloat(s.rebate) || 0;
    const perQuintal = baseRate * (1 + esc / 100) * (1 + bid / 100) * (1 - reb / 100);
    return { perQuintal, perMt: perQuintal * 10 };
  };

  const scheduleAmount = (s: CementSchedule) => s.cementQtyMT * derivedRates(s.name).perMt;
  const total = schedules.reduce((sum, s) => sum + scheduleAmount(s), 0);

  const reset = () => {
    const cleared: Record<string, ScheduleSetting> = {};
    schedules.forEach((s) => (cleared[s.name] = { escalation: '', bidRate: '', rebate: '' }));
    setBaseRate(DEFAULT_DSR_BASE_RATE);
    setSettings(cleared);
    persist(DEFAULT_DSR_BASE_RATE, cleared);
  };

  return (
    <div className="rounded-lg border border-slate-200 p-4 space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-emerald-600" />
          <h3 className="text-sm font-semibold text-slate-800">DSR 5.35 Cement Rate Calculator</h3>
        </div>
        <button type="button" onClick={reset} className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600">
          <RotateCcw className="h-3 w-3" /> Reset
        </button>
      </div>
      <p className="text-xs text-slate-500">
        When there is no direct cement-supply item, the cement rate is derived from DSR 2021 item 5.35
        (base ₹{DEFAULT_DSR_BASE_RATE}/quintal) adjusted for contract escalation, bid rate, and rebate.
        Escalation and bid rate come from the contract&apos;s schedules; the rebate is the agreement&apos;s
        single rebate. Change them here only to override this bill.
      </p>

      <div className="max-w-[220px]">
        <Label className="text-xs text-slate-600">Base Rate (₹/Qtl)</Label>
        <Input
          type="number"
          step="0.01"
          className="mt-1"
          value={baseRate}
          onChange={(e) => {
            const v = parseFloat(e.target.value) || 0;
            setBaseRate(v);
            persist(v, settings);
          }}
        />
      </div>

      {schedules.map((s) => {
        const { perQuintal, perMt } = derivedRates(s.name);
        return (
          <div key={s.name} className="rounded-lg border border-slate-100 bg-slate-50/60 p-3 space-y-3">
            <div className="flex items-center gap-2">
              <Badge variant="secondary">Schedule {s.name}</Badge>
              <span className="text-xs text-slate-500">({s.affectedItemCount} cement-affected items · {money(s.cementQtyMT)} MT)</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label className="text-xs text-slate-600">Escalation %</Label>
                <Input type="number" step="0.01" className="mt-1" placeholder="e.g. -25.00"
                  value={settings[s.name]?.escalation ?? ''} onChange={(e) => setField(s.name, 'escalation', e.target.value)} />
              </div>
              <div>
                <Label className="text-xs text-slate-600">Bid Rate % (+/-)</Label>
                <Input type="number" step="0.01" className="mt-1" placeholder="e.g. 3.80"
                  value={settings[s.name]?.bidRate ?? ''} onChange={(e) => setField(s.name, 'bidRate', e.target.value)} />
              </div>
              <div>
                <Label className="text-xs text-slate-600">Rebate % (discount)</Label>
                <Input type="number" step="0.01" className="mt-1" placeholder="e.g. 0.50"
                  value={settings[s.name]?.rebate ?? ''} onChange={(e) => setField(s.name, 'rebate', e.target.value)} />
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-slate-500">
              <span>Rate/Qtl: <span className="font-medium text-slate-700">₹{money(perQuintal)}</span></span>
              <span>Rate/MT: <span className="font-medium text-slate-700">₹{money(perMt)}</span></span>
              <span>Amount: <span className="font-semibold text-emerald-700">₹{money(scheduleAmount(s))}</span></span>
            </div>
          </div>
        );
      })}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-3">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-slate-400">Total Derived Cement Cost</div>
          <div className="text-lg font-bold text-slate-900">₹{money(total)}</div>
        </div>
        <Button type="button" onClick={() => onApply(Math.round(total * 100) / 100)} className="bg-emerald-600 hover:bg-emerald-700 text-white">
          Apply Derived Cost
        </Button>
      </div>
    </div>
  );
}
