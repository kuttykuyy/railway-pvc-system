'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Scale, RefreshCw, AlertTriangle, Info } from 'lucide-react';
import toast from 'react-hot-toast';

/**
 * Read the quoted-vs-schedule spread the /api/admin/dsr-quote-spread analysis produces.
 *
 * The one question it settles: when a report says "this zone quotes 18% above schedule",
 * is that 184 real observations or two companies wearing 184 hats? A percentage-rate
 * tender lands every item on the same quoted÷schedule ratio, so its spread is ~0 and the
 * honest sample size is the number of TENDERS. This page shows each contract's spread so
 * that call is visible, not assumed — and lists the extreme ratios that flag a bad join.
 */

interface ContractRow {
  agreementNo: string;
  zone: string;
  opened: string | null;
  edition: string;
  editionFromBill: boolean;
  items: number;
  distinctRatios: number;
  minRatio: number | null;
  medianRatio: number | null;
  maxRatio: number | null;
  spread: number;
  looksLike: string;
}

interface ZoneRow {
  zone: string;
  items: number;
  contracts: number;
  p25Ratio: number | null;
  medianRatio: number | null;
  p75Ratio: number | null;
}

interface Outlier {
  agreementNo: string;
  zone: string;
  code: string;
  edition: string;
  quoted: number | null;
  bookRate: number | null;
  ratio: number | null;
}

interface SpreadData {
  assumedDsr2023From: string;
  contracts: ContractRow[];
  byZone: ZoneRow[];
  suspiciousRatios: Outlier[];
  editionAmbiguity: {
    codesInBothDsrEditions: number;
    differByOver2Percent: number;
    medianGap: number | null;
    note: string;
  };
  verdict: string;
}

/** A quoted÷schedule ratio as a signed percentage against schedule: 1.18 → "+18%". */
const pct = (ratio: number | null): string => {
  if (ratio === null || !Number.isFinite(ratio)) return '—';
  const p = (ratio - 1) * 100;
  const sign = p > 0 ? '+' : '';
  return `${sign}${p.toFixed(p >= 10 || p <= -10 ? 0 : 1)}%`;
};

const ratioText = (ratio: number | null): string =>
  ratio === null || !Number.isFinite(ratio) ? '—' : `×${ratio.toFixed(2)}`;

/** Colour the per-tender verdict by how independent its items really are. */
const looksLikeBadge = (looksLike: string) => {
  if (looksLike.startsWith('quoted item by item')) {
    return <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 font-normal">item by item</Badge>;
  }
  if (looksLike.startsWith('one percentage')) {
    return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 font-normal">one % for the tender</Badge>;
  }
  if (looksLike.startsWith('nearly one percentage')) {
    return <Badge className="bg-amber-50 text-amber-700 hover:bg-amber-50 font-normal">nearly one %</Badge>;
  }
  return <Badge variant="outline" className="font-normal text-slate-500">too few items</Badge>;
};

export default function DsrQuoteSpreadPage() {
  const [cutoff, setCutoff] = useState('2023-07-01');
  const [data, setData] = useState<SpreadData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (from: string) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/dsr-quote-spread?dsr2023From=${encodeURIComponent(from)}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'The spread check failed');
      setData(body);
    } catch (err: any) {
      setError(err.message);
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(cutoff); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const decisive = data?.contracts.filter(c => c.items >= 3) ?? [];
  const percentageTenders = decisive.filter(c => c.looksLike.startsWith('one percentage')).length;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Scale className="h-5 w-5 text-slate-600" />
          <h1 className="text-xl font-semibold">Quoted vs schedule spread</h1>
        </div>
        <div className="flex items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor="cutoff" className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold">
              Assume DSR 2023 from
            </Label>
            <Input
              id="cutoff"
              type="date"
              value={cutoff}
              onChange={e => setCutoff(e.target.value)}
              className="h-9 w-[160px]"
            />
          </div>
          <Button onClick={() => load(cutoff)} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Checking…' : 'Re-run'}
          </Button>
        </div>
      </div>

      <p className="text-sm text-slate-600 max-w-3xl leading-relaxed">
        For every priced item the app has, this compares the contractor&apos;s quoted rate to the
        schedule (DSR/USSOR) rate for the same code. The spread within a contract answers whether
        that tender was quoted as one percentage for the whole work or item by item — which decides
        whether a &ldquo;quoted rates by zone&rdquo; report has a real sample or just a handful of tenders.
      </p>

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-3">
          <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
          <div className="text-sm text-red-900">{error}</div>
        </div>
      )}

      {loading && !data && (
        <div className="flex justify-center py-16"><LoadingSpinner size="lg" text="Running the spread check…" /></div>
      )}

      {data && (
        <>
          {/* The headline conclusion. */}
          <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50/60 px-4 py-3.5">
            <Info className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-emerald-900">Verdict</p>
              <p className="text-sm text-emerald-800 leading-relaxed mt-0.5">{data.verdict}</p>
            </div>
          </div>

          {/* At-a-glance counts. */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Contracts matched', value: data.contracts.length.toLocaleString() },
              { label: 'Enough items to judge', value: decisive.length.toLocaleString() },
              { label: 'Look like one % / tender', value: percentageTenders.toLocaleString() },
              { label: 'Zones with data', value: data.byZone.length.toLocaleString() },
            ].map(stat => (
              <div key={stat.label} className="rounded-lg border border-slate-200 bg-white px-4 py-3">
                <div className="text-2xl font-bold text-slate-800 tabular-nums">{stat.value}</div>
                <div className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold mt-0.5">{stat.label}</div>
              </div>
            ))}
          </div>

          {/* By zone. */}
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm font-medium text-slate-600">
                By zone — where the quoted rate lands against schedule
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs text-slate-500">
                    <tr>
                      <th className="px-3 py-2 font-medium">Zone</th>
                      <th className="px-3 py-2 font-medium text-right">Items</th>
                      <th className="px-3 py-2 font-medium text-right">Contracts</th>
                      <th className="px-3 py-2 font-medium text-right">Median</th>
                      <th className="px-3 py-2 font-medium text-right whitespace-nowrap">Middle half (25–75%)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {data.byZone.map(z => (
                      <tr key={z.zone} className="tabular-nums">
                        <td className="px-3 py-2 font-medium text-slate-700 uppercase">{z.zone}</td>
                        <td className="px-3 py-2 text-right text-slate-500">{z.items.toLocaleString()}</td>
                        <td className="px-3 py-2 text-right text-slate-500">{z.contracts.toLocaleString()}</td>
                        <td className="px-3 py-2 text-right font-medium text-slate-800">{pct(z.medianRatio)}</td>
                        <td className="px-3 py-2 text-right text-slate-500 whitespace-nowrap">
                          {pct(z.p25Ratio)} … {pct(z.p75Ratio)}
                        </td>
                      </tr>
                    ))}
                    {data.byZone.length === 0 && (
                      <tr><td colSpan={5} className="px-3 py-8 text-center text-slate-500">No matched items.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Per contract — the core. */}
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm font-medium text-slate-600">
                Per contract — one quoted percentage, or item by item?
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs text-slate-500">
                    <tr>
                      <th className="px-3 py-2 font-medium">Agreement</th>
                      <th className="px-3 py-2 font-medium">Zone</th>
                      <th className="px-3 py-2 font-medium">Edition</th>
                      <th className="px-3 py-2 font-medium text-right">Items</th>
                      <th className="px-3 py-2 font-medium text-right whitespace-nowrap">Median vs schedule</th>
                      <th className="px-3 py-2 font-medium text-right whitespace-nowrap">Range</th>
                      <th className="px-3 py-2 font-medium text-right">Spread</th>
                      <th className="px-3 py-2 font-medium">Looks like</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {data.contracts.map((c, i) => (
                      <tr key={`${c.agreementNo}-${i}`} className="align-top">
                        <td className="px-3 py-2 font-medium text-slate-700 whitespace-nowrap">{c.agreementNo}</td>
                        <td className="px-3 py-2 text-slate-500 uppercase">{c.zone}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-xs text-slate-500">
                          {c.edition}
                          {!c.editionFromBill && (
                            <span className="block text-[10px] text-amber-600">guessed from date</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-500">{c.items}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium text-slate-800">{pct(c.medianRatio)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-500 whitespace-nowrap">
                          {ratioText(c.minRatio)} – {ratioText(c.maxRatio)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-500">
                          {(c.spread * 100).toFixed(1)}%
                        </td>
                        <td className="px-3 py-2">{looksLikeBadge(c.looksLike)}</td>
                      </tr>
                    ))}
                    {data.contracts.length === 0 && (
                      <tr><td colSpan={8} className="px-3 py-8 text-center text-slate-500">No contract had matched items.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Edition ambiguity — how much the DSR 2021/2023 guess is deciding. */}
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm font-medium text-slate-600">How much the edition guess matters</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <div className="text-2xl font-bold text-slate-800 tabular-nums">
                    {data.editionAmbiguity.codesInBothDsrEditions.toLocaleString()}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">codes priced in both DSR 2021 &amp; 2023</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-slate-800 tabular-nums">
                    {data.editionAmbiguity.differByOver2Percent.toLocaleString()}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">of those differ by more than 2%</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-slate-800 tabular-nums">
                    {pct(data.editionAmbiguity.medianGap === null ? null : 1 + data.editionAmbiguity.medianGap)}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">median gap between the two editions</div>
                </div>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed mt-3 max-w-3xl">{data.editionAmbiguity.note}</p>
            </CardContent>
          </Card>

          {/* Suspicious ratios — sanity-check the join, not the contractor. */}
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm font-medium text-slate-600">
                Extreme ratios — likely a bad join, not a real bid
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs text-slate-500">
                    <tr>
                      <th className="px-3 py-2 font-medium">Agreement</th>
                      <th className="px-3 py-2 font-medium">Zone</th>
                      <th className="px-3 py-2 font-medium">Code</th>
                      <th className="px-3 py-2 font-medium">Edition</th>
                      <th className="px-3 py-2 font-medium text-right">Quoted</th>
                      <th className="px-3 py-2 font-medium text-right">Schedule</th>
                      <th className="px-3 py-2 font-medium text-right">Ratio</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {data.suspiciousRatios.map((o, i) => (
                      <tr key={`${o.agreementNo}-${o.code}-${i}`} className="tabular-nums">
                        <td className="px-3 py-2 text-slate-700 whitespace-nowrap">{o.agreementNo}</td>
                        <td className="px-3 py-2 text-slate-500 uppercase">{o.zone}</td>
                        <td className="px-3 py-2 text-slate-700 whitespace-nowrap">{o.code}</td>
                        <td className="px-3 py-2 text-xs text-slate-500 whitespace-nowrap">{o.edition}</td>
                        <td className="px-3 py-2 text-right text-slate-500">
                          {o.quoted === null ? '—' : o.quoted.toLocaleString('en-IN')}
                        </td>
                        <td className="px-3 py-2 text-right text-slate-500">
                          {o.bookRate === null ? '—' : o.bookRate.toLocaleString('en-IN')}
                        </td>
                        <td className="px-3 py-2 text-right font-medium text-red-600">{ratioText(o.ratio)}</td>
                      </tr>
                    ))}
                    {data.suspiciousRatios.length === 0 && (
                      <tr><td colSpan={7} className="px-3 py-8 text-center text-slate-500">No extreme ratios — the join looks clean.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
