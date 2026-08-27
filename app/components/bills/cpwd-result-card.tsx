'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Boxes, AlertTriangle, FileDown } from 'lucide-react';

/**
 * The CPWD 10CA (Engine B) result on a bill page. Fetches the stored result and renders
 * nothing for a Railway bill (or one not computed), so it is safe to drop onto any bill.
 */

interface Line { label: string; unit: string; quantity: number; basePrice: number; currentPrice: number; priceDelta: number; variation: number; baseMonthUsed: string | null; currentMonthUsed: string | null }
interface CcLine { label: string; percent: number; baseIndex: number; currentIndex: number; indexRatio: number; variation: number; baseMonthUsed: string | null; currentMonthUsed: string | null }
interface Data { present: boolean; region: string | null; baseMonth: string; billMonth: string; totalVariation: number; breakdown: Line[]; flags: Array<{ code: string; reason: string }>; excluded: string[]; cpwd10ccTotal: number; cpwd10ccBreakdown: CcLine[]; combinedTotal: number; cpwd10ccNote: string | null }

const rupee = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const qty = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 3 });

export function CpwdResultCard({ billId }: { billId: string }) {
  const [data, setData] = useState<Data | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/bills/${billId}/cpwd-10ca`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (alive && d?.present) setData(d); })
      .catch(() => {});
    return () => { alive = false; };
  }, [billId]);

  if (!data) return null;

  // A price/index is a fallback when the month it came from is not the month asked for
  // (the tender month for the base, the bill month for the current). null = no data at all.
  const isFallback = (used: string | null, target: string) => used == null || used !== target;
  const monthNote = (base: string | null, cur: string | null) => {
    const warn = isFallback(base, data.baseMonth) || isFallback(cur, data.billMonth);
    return (
      <span className={`block text-[10px] font-normal ${warn ? 'text-amber-700' : 'text-slate-400'}`}>
        base {base || '—'} · now {cur || '—'}{warn ? ' ⚠' : ''}
      </span>
    );
  };
  const anyFallback = [...data.breakdown, ...data.cpwd10ccBreakdown]
    .some(l => isFallback(l.baseMonthUsed, data.baseMonth) || isFallback(l.currentMonthUsed, data.billMonth));

  return (
    <Card className="border-emerald-200">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Boxes className="h-5 w-5 text-emerald-700" /> CPWD Clause 10CA — price variation
            </CardTitle>
            <p className="text-xs text-slate-500 mt-1">
              Region {data.region || '—'} · base {data.baseMonth} → bill {data.billMonth}. Quantity of each material × its price movement.
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <a href={`/api/bills/${billId}/cpwd-10ca-report`} target="_blank" rel="noopener noreferrer">
              <FileDown className="h-4 w-4 mr-1.5" /> Statement
            </a>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {anyFallback && (
          <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" />
            <span>
              Some prices/indices came from an <strong>earlier month</strong> than asked for (tender base {data.baseMonth},
              bill {data.billMonth}) — marked ⚠ below. Load the exact CPWD circular / index months before relying on these figures.
            </span>
          </div>
        )}
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-3 py-2 font-medium">Material</th>
                <th className="px-3 py-2 font-medium text-right">Quantity</th>
                <th className="px-3 py-2 font-medium text-right">Base price</th>
                <th className="px-3 py-2 font-medium text-right">Current price</th>
                <th className="px-3 py-2 font-medium text-right">Δ / unit</th>
                <th className="px-3 py-2 font-medium text-right">Variation</th>
              </tr>
            </thead>
            <tbody className="divide-y tabular-nums">
              {data.breakdown.map((l, i) => (
                <tr key={i}>
                  <td className="px-3 py-2 font-medium text-slate-700">{l.label}{monthNote(l.baseMonthUsed, l.currentMonthUsed)}</td>
                  <td className="px-3 py-2 text-right text-slate-600">{qty(l.quantity)} {l.unit}</td>
                  <td className="px-3 py-2 text-right text-slate-500">{rupee(l.basePrice)}</td>
                  <td className="px-3 py-2 text-right text-slate-500">{rupee(l.currentPrice)}</td>
                  <td className={`px-3 py-2 text-right ${l.priceDelta >= 0 ? 'text-slate-600' : 'text-red-600'}`}>{rupee(l.priceDelta)}</td>
                  <td className={`px-3 py-2 text-right font-semibold ${l.variation >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{rupee(l.variation)}</td>
                </tr>
              ))}
              {data.breakdown.length === 0 && (
                <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-500">No priced materials — check the CPWD prices are loaded for this region and month.</td></tr>
              )}
              <tr className="bg-slate-50 font-semibold">
                <td className="px-3 py-2" colSpan={5}>Total 10CA variation</td>
                <td className={`px-3 py-2 text-right ${data.totalVariation >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{rupee(data.totalVariation)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {data.flags.length > 0 && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" />
            <div>
              <span className="font-semibold">{data.flags.length} steel item(s) not priced</span> — unit could not be resolved:
              {' '}{data.flags.map(f => f.code).join(', ')}. Fix the rate-book unit and recalculate.
            </div>
          </div>
        )}

        {data.excluded.length > 0 && (
          <p className="mt-2 text-xs text-slate-400">Not priced in this version: {data.excluded.join(', ')}.</p>
        )}

        {/* 10CC — labour / other materials / POL, on WPI/CPI with the 15% haircut. */}
        {data.cpwd10ccBreakdown.length > 0 && (
          <div className="mt-5">
            <div className="text-sm font-semibold text-slate-700 mb-1.5">Clause 10CC — labour, materials &amp; POL</div>
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs text-slate-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">Component</th>
                    <th className="px-3 py-2 font-medium text-right">Schedule-E %</th>
                    <th className="px-3 py-2 font-medium text-right">Base index</th>
                    <th className="px-3 py-2 font-medium text-right">Current index</th>
                    <th className="px-3 py-2 font-medium text-right">Variation</th>
                  </tr>
                </thead>
                <tbody className="divide-y tabular-nums">
                  {data.cpwd10ccBreakdown.map((l, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2 font-medium text-slate-700">{l.label}{monthNote(l.baseMonthUsed, l.currentMonthUsed)}</td>
                      <td className="px-3 py-2 text-right text-slate-500">{l.percent}%</td>
                      <td className="px-3 py-2 text-right text-slate-500">{l.baseIndex || '—'}</td>
                      <td className="px-3 py-2 text-right text-slate-500">{l.currentIndex ? l.currentIndex.toFixed(1) : '—'}</td>
                      <td className={`px-3 py-2 text-right font-semibold ${l.variation >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{rupee(l.variation)}</td>
                    </tr>
                  ))}
                  <tr className="bg-slate-50 font-semibold">
                    <td className="px-3 py-2" colSpan={4}>Total 10CC variation</td>
                    <td className={`px-3 py-2 text-right ${data.cpwd10ccTotal >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{rupee(data.cpwd10ccTotal)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 10CC eligibility note (skipped / unverified). */}
        {data.cpwd10ccNote && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-slate-400" />
            <span>{data.cpwd10ccNote}</span>
          </div>
        )}

        {/* Combined CPWD total = 10CA + 10CC. */}
        <div className="mt-4 flex items-center justify-between rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3">
          <span className="text-sm font-semibold text-emerald-900">Total CPWD price variation (10CA + 10CC)</span>
          <span className={`text-lg font-bold tabular-nums ${data.combinedTotal >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{rupee(data.combinedTotal)}</span>
        </div>
      </CardContent>
    </Card>
  );
}
