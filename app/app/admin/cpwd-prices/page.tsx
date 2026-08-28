'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Boxes, Database, Plus, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';

/**
 * The CPWD 10CA material-price feed (Engine B's data source). Seed the verified Delhi-NCR
 * base + recent month to create the table, then add a month's prices per region. Separate
 * from the WPI/CPI indices the Railway engine uses — this is CPWD's own monthly circular.
 */

const MATERIALS: Array<{ key: string; label: string; unit: string }> = [
  { key: 'cement-opc', label: 'Cement (OPC)', unit: 'MT' },
  { key: 'cement-ppc', label: 'Cement (PPC)', unit: 'MT' },
  { key: 'steel-tmt', label: 'Reinforcement steel (TMT)', unit: 'MT' },
  { key: 'steel-structural', label: 'Structural steel', unit: 'MT' },
  { key: 'diesel', label: 'Diesel (POL)', unit: 'litre' },
];

interface PriceRow { region: string; month: string; material: string; price: number; aipi: number | null }
interface Status {
  rows?: PriceRow[];
  ready: boolean;
  loaded: { rows: number; regions: string[]; latestMonth: string | null; lastRefreshed?: string | null };
  message: string;
}

export default function CpwdPricesPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [region, setRegion] = useState('delhi-ncr');
  const [month, setMonth] = useState('');
  const [prices, setPrices] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/cpwd-prices');
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Failed to load');
      setStatus(body);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const seed = async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/admin/cpwd-prices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'seed' }) });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Seed failed');
      toast.success(body.message || 'Seeded');
      await load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const fetchNsr = async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/admin/cpwd-prices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'fetch-nsr' }) });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Import failed');
      toast.success(body.message || 'Imported', { duration: 8000 });
      await load();
    } catch (e: any) {
      toast.error(e.message, { duration: 8000 });
    } finally {
      setBusy(false);
    }
  };

  const saveMonth = async () => {
    if (!region.trim() || !/^\d{4}-\d{2}$/.test(month)) { toast.error('Enter a region and a month as YYYY-MM.'); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/admin/cpwd-prices', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'rows', region, month, prices }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Save failed');
      toast.success(body.message || 'Saved');
      setPrices({});
      await load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-2">
        <Boxes className="h-5 w-5 text-slate-600" />
        <h1 className="text-xl font-semibold">CPWD 10CA material prices</h1>
      </div>
      <p className="text-sm text-slate-600 max-w-3xl leading-relaxed">
        Engine B (CPWD Clause 10CA) prices materials on their actual price movement, not a WPI ratio.
        CPWD publishes a monthly circular of base prices and an All-India Price Index (AIPI, Oct 2012 = 100)
        per region. This is that feed — separate from the WPI/CPI indices the Railway engine reads, and used
        only for contracts on the CPWD scheme.
      </p>

      {loading && <div className="flex justify-center py-12"><LoadingSpinner text="Loading feed…" /></div>}

      {!loading && status && (
        <>
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-2"><Database className="h-4 w-4" /> Feed status</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {status.ready ? (
                <div className="text-sm text-slate-700">
                  <span className="font-semibold">{status.loaded.rows.toLocaleString('en-IN')}</span> rows ·
                  regions: {status.loaded.regions.join(', ') || '—'} ·
                  latest month: {status.loaded.latestMonth || '—'}
                  <span className="block text-xs text-slate-400 mt-0.5">
                    Last refreshed: {status.loaded.lastRefreshed
                      ? new Date(status.loaded.lastRefreshed).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
                      : '—'} · auto-refreshes weekly from NSRCivil
                  </span>
                </div>
              ) : (
                <div className="flex items-start gap-2 text-sm text-amber-800">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" />
                  <span>No feed table yet. Seed it to create the table and load the verified Delhi-NCR base (Oct 2012) and Dec 2025 circular.</span>
                </div>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <Button onClick={fetchNsr} disabled={busy}>
                  <Database className="h-4 w-4 mr-1.5" /> Auto-import from NSRCivil (all months)
                </Button>
                <Button variant="outline" onClick={seed} disabled={busy}>{status.ready ? 'Re-seed 2 verified rows' : 'Create table & seed'}</Button>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                Auto-import pulls the full Delhi-NCR monthly history (2018 onward) that NSRCivil aggregates
                from the CPWD circulars — including the older base months a contract&apos;s tender date needs.
                NSRCivil is a third party; verify against the official CPWD circular before a real claim.
              </p>
            </CardContent>
          </Card>

          {/* Browse the loaded prices — one row per month, newest first. */}
          {status.ready && (status.rows?.length || 0) > 0 && (() => {
            // Pivot rows into region+month → material → { price, aipi }.
            const byKey = new Map<string, Record<string, { price: number; aipi: number | null }>>();
            for (const r of status.rows!) {
              const k = `${r.region}|${r.month}`;
              const cur = byKey.get(k) || {};
              cur[r.material] = { price: r.price, aipi: r.aipi };
              byKey.set(k, cur);
            }
            const keys = Array.from(byKey.keys());
            return (
              <Card>
                <CardHeader className="py-3">
                  <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-2"><Database className="h-4 w-4" /> Loaded prices ({keys.length} months)</CardTitle>
                  <CardDescription>Every month in the feed, newest first. Prices ₹/MT (cement &amp; steel), ₹/litre (diesel).</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto max-h-[28rem] overflow-y-auto">
                    <table className="w-full text-sm tabular-nums">
                      <thead className="bg-slate-50 text-left text-xs text-slate-500 sticky top-0">
                        <tr>
                          <th className="px-3 py-2 font-medium">Region</th>
                          <th className="px-3 py-2 font-medium">Month</th>
                          {MATERIALS.map(m => <th key={m.key} className="px-3 py-2 font-medium text-right whitespace-nowrap">{m.label} <span className="font-normal text-slate-400">₹ · AIPI</span></th>)}
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {keys.map(k => {
                          const [region, month] = k.split('|');
                          const cells = byKey.get(k)!;
                          return (
                            <tr key={k}>
                              <td className="px-3 py-1.5 text-slate-500 uppercase">{region}</td>
                              <td className="px-3 py-1.5 font-medium text-slate-700">{month}</td>
                              {MATERIALS.map(m => {
                                const c = cells[m.key];
                                return (
                                  <td key={m.key} className="px-3 py-1.5 text-right text-slate-600 whitespace-nowrap">
                                    {c ? (
                                      <>
                                        ₹{c.price.toLocaleString('en-IN')}
                                        <span className="ml-1 text-xs text-slate-400">{c.aipi != null ? c.aipi.toFixed(2) : '—'}</span>
                                      </>
                                    ) : '—'}
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            );
          })()}

          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-2"><Plus className="h-4 w-4" /> Add a month's prices</CardTitle>
              <CardDescription>Enter the circular's price per unit (₹/MT for cement &amp; steel, ₹/litre for diesel). AIPI is optional.</CardDescription>
            </CardHeader>
            <CardContent className="pt-0 space-y-4">
              <div className="grid grid-cols-2 gap-3 max-w-md">
                <div className="space-y-1">
                  <Label htmlFor="region" className="text-xs">Region</Label>
                  <Input id="region" value={region} onChange={e => setRegion(e.target.value)} placeholder="delhi-ncr" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="month" className="text-xs">Month (YYYY-MM)</Label>
                  <Input id="month" value={month} onChange={e => setMonth(e.target.value)} placeholder="2026-03" />
                </div>
              </div>
              <div className="space-y-2">
                {MATERIALS.map(m => (
                  <div key={m.key} className="grid grid-cols-[1fr,120px,120px] gap-3 items-center max-w-lg">
                    <span className="text-sm text-slate-700">{m.label} <span className="text-xs text-slate-400">₹/{m.unit}</span></span>
                    <Input
                      type="number" step="0.01" placeholder="price"
                      value={prices[m.key] || ''}
                      onChange={e => setPrices(p => ({ ...p, [m.key]: e.target.value }))}
                    />
                    <Input
                      type="number" step="0.01" placeholder="AIPI (opt)"
                      value={prices[`${m.key}_aipi`] || ''}
                      onChange={e => setPrices(p => ({ ...p, [`${m.key}_aipi`]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>
              <Button onClick={saveMonth} disabled={busy}>Save month</Button>
            </CardContent>
          </Card>

          <p className="text-xs text-slate-400 max-w-3xl">
            Diesel is stored here for completeness but Engine B v1 does not price it (there is no measured
            quantity or coefficient for it) — the 10CA statement discloses that.
          </p>
        </>
      )}
    </div>
  );
}
