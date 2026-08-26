'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { TrendingUp, RefreshCw, AlertTriangle, Search, X } from 'lucide-react';
import toast from 'react-hot-toast';

/**
 * "How much above DSR did contractors actually quote?" — read three ways.
 *
 * Contractors in different zones bid differently to win a tender, and this is the plain
 * cost-difference answer against the schedule rate: by zone, by contractor, and by DSR
 * item, with a drill-in to every quote behind one item code. Fed by
 * /api/admin/dsr-cost-difference.
 */

interface ZoneRow { zone: string; items: number; contracts: number; p25Ratio: number | null; medianRatio: number | null; p75Ratio: number | null }
interface ContractorRow { contractor: string; zones: string[]; items: number; tenders: number; minRatio: number | null; medianRatio: number | null; maxRatio: number | null }
interface ItemRow { code: string; edition: string; dsrRate: number | null; quotes: number; tenders: number; minRatio: number | null; medianRatio: number | null; maxRatio: number | null; medianQuoted: number | null }
interface DetailRow { agreementNo: string; contractor: string; zone: string; edition: string; quoted: number | null; dsrRate: number | null; ratio: number | null }

interface Data {
  assumedDsr2023From: string;
  overall: { items: number; contracts: number; p25Ratio: number | null; medianRatio: number | null; p75Ratio: number | null };
  byZone: ZoneRow[];
  byContractor: ContractorRow[];
  byItem: ItemRow[];
}

type View = 'zone' | 'contractor' | 'item';

/** A quoted÷DSR ratio as a signed percentage against par: 1.18 → "+18%". */
const pct = (ratio: number | null): string => {
  if (ratio === null || !Number.isFinite(ratio)) return '—';
  const p = (ratio - 1) * 100;
  const sign = p > 0 ? '+' : '';
  return `${sign}${p.toFixed(Math.abs(p) >= 10 ? 0 : 1)}%`;
};
const rupee = (v: number | null): string => (v === null || !Number.isFinite(v) ? '—' : `₹${v.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`);

/** Green below par, red far above, amber in between — the difference at a glance. */
const pctClass = (ratio: number | null): string => {
  if (ratio === null || !Number.isFinite(ratio)) return 'text-slate-400';
  if (ratio <= 1) return 'text-emerald-700';
  if (ratio >= 1.25) return 'text-red-600';
  return 'text-amber-700';
};

export default function DsrCostDifferencePage() {
  const [cutoff, setCutoff] = useState('2023-07-01');
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [view, setView] = useState<View>('zone');

  // Item drill-in: every quote behind one code.
  const [detailCode, setDetailCode] = useState('');
  const [detail, setDetail] = useState<DetailRow[] | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(async (from: string) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/dsr-cost-difference?dsr2023From=${encodeURIComponent(from)}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'The cost-difference check failed');
      setData(body);
    } catch (err: any) {
      setError(err.message);
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const openDetail = useCallback(async (code: string) => {
    setDetailCode(code);
    setDetail(null);
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/admin/dsr-cost-difference?dsr2023From=${encodeURIComponent(cutoff)}&code=${encodeURIComponent(code)}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Could not load the item');
      setDetail(body.itemDetail || []);
    } catch (err: any) {
      toast.error(err.message);
      setDetailCode('');
    } finally {
      setDetailLoading(false);
    }
  }, [cutoff]);

  useEffect(() => { load(cutoff); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const VIEWS: Array<{ key: View; label: string }> = [
    { key: 'zone', label: 'By zone' },
    { key: 'contractor', label: 'By contractor' },
    { key: 'item', label: 'By DSR item' },
  ];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-slate-600" />
          <h1 className="text-xl font-semibold">Cost difference vs DSR</h1>
        </div>
        <div className="flex items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor="cutoff" className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold">
              Assume DSR 2023 from
            </Label>
            <Input id="cutoff" type="date" value={cutoff} onChange={e => setCutoff(e.target.value)} className="h-9 w-[160px]" />
          </div>
          <Button onClick={() => load(cutoff)} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Checking…' : 'Re-run'}
          </Button>
        </div>
      </div>

      <p className="text-sm text-slate-600 max-w-3xl leading-relaxed">
        How far above (or below) the DSR/USSOR par rate contractors actually quoted, comparing every
        priced item to the book rate for its code. A figure like <span className="font-medium">+18%</span> means
        the quoted rate ran 18% over schedule. Read it by zone, by contractor, or by item — and open an item
        to see every quote behind it.
      </p>

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-3">
          <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
          <div className="text-sm text-red-900">{error}</div>
        </div>
      )}

      {loading && !data && (
        <div className="flex justify-center py-16"><LoadingSpinner size="lg" text="Comparing quotes to DSR…" /></div>
      )}

      {data && (
        <>
          {/* Overall headline. */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Typical quote vs DSR', value: pct(data.overall.medianRatio), big: true },
              { label: 'Middle half', value: `${pct(data.overall.p25Ratio)} … ${pct(data.overall.p75Ratio)}` },
              { label: 'Items compared', value: data.overall.items.toLocaleString() },
              { label: 'Contracts', value: data.overall.contracts.toLocaleString() },
            ].map(s => (
              <div key={s.label} className="rounded-lg border border-slate-200 bg-white px-4 py-3">
                <div className={`text-2xl font-bold tabular-nums ${s.big ? pctClass(data.overall.medianRatio) : 'text-slate-800'}`}>{s.value}</div>
                <div className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>

          {/* View switch. */}
          <div className="flex gap-1 border-b border-slate-200">
            {VIEWS.map(v => (
              <button
                key={v.key}
                onClick={() => setView(v.key)}
                className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors ${
                  view === v.key ? 'border-emerald-500 text-emerald-700' : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>

          {view === 'zone' && (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-left text-xs text-slate-500">
                      <tr>
                        <th className="px-3 py-2 font-medium">Zone</th>
                        <th className="px-3 py-2 font-medium text-right">Typical vs DSR</th>
                        <th className="px-3 py-2 font-medium text-right whitespace-nowrap">Middle half (25–75%)</th>
                        <th className="px-3 py-2 font-medium text-right">Items</th>
                        <th className="px-3 py-2 font-medium text-right">Contracts</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {data.byZone.map(z => (
                        <tr key={z.zone} className="tabular-nums">
                          <td className="px-3 py-2 font-medium text-slate-700 uppercase">{z.zone}</td>
                          <td className={`px-3 py-2 text-right font-semibold ${pctClass(z.medianRatio)}`}>{pct(z.medianRatio)}</td>
                          <td className="px-3 py-2 text-right text-slate-500 whitespace-nowrap">{pct(z.p25Ratio)} … {pct(z.p75Ratio)}</td>
                          <td className="px-3 py-2 text-right text-slate-500">{z.items.toLocaleString()}</td>
                          <td className="px-3 py-2 text-right text-slate-500">{z.contracts.toLocaleString()}</td>
                        </tr>
                      ))}
                      {data.byZone.length === 0 && <tr><td colSpan={5} className="px-3 py-8 text-center text-slate-500">No matched items.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {view === 'contractor' && (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-left text-xs text-slate-500">
                      <tr>
                        <th className="px-3 py-2 font-medium">Contractor</th>
                        <th className="px-3 py-2 font-medium">Zones</th>
                        <th className="px-3 py-2 font-medium text-right">Typical vs DSR</th>
                        <th className="px-3 py-2 font-medium text-right whitespace-nowrap">Range</th>
                        <th className="px-3 py-2 font-medium text-right">Tenders</th>
                        <th className="px-3 py-2 font-medium text-right">Items</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {data.byContractor.map((c, i) => (
                        <tr key={`${c.contractor}-${i}`} className="align-top">
                          <td className="px-3 py-2 font-medium text-slate-700">{c.contractor}</td>
                          <td className="px-3 py-2">
                            <div className="flex flex-wrap gap-1">
                              {c.zones.map(z => <Badge key={z} variant="outline" className="font-normal uppercase text-[10px]">{z}</Badge>)}
                            </div>
                          </td>
                          <td className={`px-3 py-2 text-right font-semibold tabular-nums ${pctClass(c.medianRatio)}`}>{pct(c.medianRatio)}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-slate-500 whitespace-nowrap">{pct(c.minRatio)} … {pct(c.maxRatio)}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-slate-500">{c.tenders}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-slate-500">{c.items}</td>
                        </tr>
                      ))}
                      {data.byContractor.length === 0 && <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-500">No matched items.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {view === 'item' && (
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm font-medium text-slate-600">
                  Each DSR item — the going rate above par. Click a row to see every quote behind it.
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-left text-xs text-slate-500">
                      <tr>
                        <th className="px-3 py-2 font-medium">Code</th>
                        <th className="px-3 py-2 font-medium text-right">DSR rate</th>
                        <th className="px-3 py-2 font-medium text-right">Median quoted</th>
                        <th className="px-3 py-2 font-medium text-right">Typical vs DSR</th>
                        <th className="px-3 py-2 font-medium text-right whitespace-nowrap">Range</th>
                        <th className="px-3 py-2 font-medium text-right">Quotes</th>
                        <th className="px-3 py-2 font-medium text-right">Tenders</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {data.byItem.map((it, i) => (
                        <tr
                          key={`${it.code}-${it.edition}-${i}`}
                          className="tabular-nums cursor-pointer hover:bg-slate-50"
                          onClick={() => openDetail(it.code)}
                        >
                          <td className="px-3 py-2 font-medium text-slate-700 whitespace-nowrap">
                            {it.code}
                            <span className="block text-[10px] font-normal text-slate-400">{it.edition}</span>
                          </td>
                          <td className="px-3 py-2 text-right text-slate-500">{rupee(it.dsrRate)}</td>
                          <td className="px-3 py-2 text-right text-slate-500">{rupee(it.medianQuoted)}</td>
                          <td className={`px-3 py-2 text-right font-semibold ${pctClass(it.medianRatio)}`}>{pct(it.medianRatio)}</td>
                          <td className="px-3 py-2 text-right text-slate-500 whitespace-nowrap">{pct(it.minRatio)} … {pct(it.maxRatio)}</td>
                          <td className="px-3 py-2 text-right text-slate-500">{it.quotes}</td>
                          <td className="px-3 py-2 text-right text-slate-500">{it.tenders}</td>
                        </tr>
                      ))}
                      {data.byItem.length === 0 && <tr><td colSpan={7} className="px-3 py-8 text-center text-slate-500">No matched items.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Item drill-in overlay. */}
      {detailCode && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 sm:p-8 overflow-y-auto" onClick={() => setDetailCode('')}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl mt-8" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3.5 border-b">
              <div className="flex items-center gap-2">
                <Search className="h-4 w-4 text-slate-500" />
                <h2 className="text-sm font-semibold text-slate-800">Every quote for code {detailCode}</h2>
              </div>
              <button onClick={() => setDetailCode('')} className="text-slate-400 hover:text-slate-700"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-0 max-h-[70vh] overflow-y-auto">
              {detailLoading && <div className="flex justify-center py-12"><LoadingSpinner text="Loading quotes…" /></div>}
              {!detailLoading && detail && (
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs text-slate-500 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 font-medium">Contractor</th>
                      <th className="px-3 py-2 font-medium">Zone</th>
                      <th className="px-3 py-2 font-medium">Agreement</th>
                      <th className="px-3 py-2 font-medium text-right">Quoted</th>
                      <th className="px-3 py-2 font-medium text-right">DSR</th>
                      <th className="px-3 py-2 font-medium text-right">vs DSR</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {detail.map((d, i) => (
                      <tr key={`${d.agreementNo}-${i}`} className="tabular-nums">
                        <td className="px-3 py-2 text-slate-700">{d.contractor}</td>
                        <td className="px-3 py-2 text-slate-500 uppercase">{d.zone}</td>
                        <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{d.agreementNo}</td>
                        <td className="px-3 py-2 text-right text-slate-600">{rupee(d.quoted)}</td>
                        <td className="px-3 py-2 text-right text-slate-500">{rupee(d.dsrRate)}</td>
                        <td className={`px-3 py-2 text-right font-semibold ${pctClass(d.ratio)}`}>{pct(d.ratio)}</td>
                      </tr>
                    ))}
                    {detail.length === 0 && <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-500">No quotes matched this code.</td></tr>}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
