'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Scale, Download, Save, ChevronDown, ChevronUp, IndianRupee } from 'lucide-react';

interface ShortfallRow {
  key: string;
  label: string;
  railwayField: string;
  entitlement: number;
  railwayPaid: number | null;
  shortfall: number | null;
}
interface ShortfallResult {
  hasRailwayData: boolean;
  hasComponentBreakdown: boolean;
  entitlementTotal: number;
  railwayTotal: number;
  shortfallTotal: number;
  recoverable: number;
  overpaid: number;
  shortfallPct: number;
  entitlementIsRecoveryFromContractor: boolean;
  direction: 'recoverable' | 'over_settled' | 'matched';
  rows: ShortfallRow[];
}

const inr = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function ShortfallAudit({ billId }: { billId: string }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<ShortfallResult | null>(null);
  const [showComponents, setShowComponents] = useState(false);
  const [railwayTotal, setRailwayTotal] = useState('');
  const [railwayReference, setRailwayReference] = useState('');
  const [components, setComponents] = useState<Record<string, string>>({});

  const load = async () => {
    try {
      const res = await fetch(`/api/bills/${billId}/shortfall`);
      if (!res.ok) { setLoading(false); return; }
      const data = await res.json();
      setResult(data.result);
      if (data.audit) {
        setRailwayTotal(data.audit.railwayTotal ? String(data.audit.railwayTotal) : '');
        setRailwayReference(data.audit.railwayReference || '');
        const c: Record<string, string> = {};
        for (const row of data.result.rows) {
          const v = data.audit[row.railwayField];
          if (v != null) c[row.railwayField] = String(v);
        }
        setComponents(c);
        if (data.result.hasComponentBreakdown) setShowComponents(true);
      }
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [billId]);

  const save = async () => {
    setSaving(true);
    try {
      const payload: Record<string, unknown> = { railwayTotal: Number(railwayTotal) || 0, railwayReference };
      if (showComponents) for (const [k, v] of Object.entries(components)) payload[k] = v === '' ? null : Number(v);
      const res = await fetch(`/api/bills/${billId}/shortfall`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      setResult(data.result);
      toast({ title: 'Saved', description: 'Railway PVC figures recorded and shortfall recomputed.' });
    } catch (e: any) {
      toast({ title: 'Could not save', description: e.message, variant: 'destructive' });
    }
    setSaving(false);
  };

  if (loading || !result) return null;

  const { entitlementTotal, railwayTotal: paidTotal, recoverable, overpaid, shortfallPct, hasRailwayData, direction } = result;
  const isRecoverable = direction === 'recoverable';
  const isOverSettled = direction === 'over_settled';
  const resultCard = isRecoverable
    ? { border: 'border-rose-200 bg-rose-50/40 dark:bg-rose-950/10', text: 'text-rose-600 dark:text-rose-400', label: 'Recoverable from Railway', amount: recoverable }
    : isOverSettled
      ? { border: 'border-amber-300 bg-amber-50/50 dark:bg-amber-950/10', text: 'text-amber-600 dark:text-amber-400', label: 'Railway over-settled', amount: overpaid }
      : { border: 'border-emerald-200 bg-emerald-50/40 dark:bg-emerald-950/10', text: 'text-emerald-600 dark:text-emerald-400', label: 'Matches entitlement', amount: 0 };

  return (
    <Card className="border border-slate-200/80 dark:border-slate-800 rounded-3xl shadow-sm overflow-hidden">
      <CardHeader className="bg-slate-50/50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800/80 px-6 py-4">
        <CardTitle className="text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2">
          <Scale size={18} className="text-rose-500" />
          PVC Shortfall Auditor
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6 space-y-5">
        <p className="text-sm text-muted-foreground">
          Enter the PVC amount Railway actually settled for this bill. We compare it against the
          GCC-correct entitlement this app computed ({inr(result.entitlementTotal)}) and show the difference.
        </p>
        {result.entitlementIsRecoveryFromContractor && (
          <p className="text-xs rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 text-amber-800 dark:text-amber-300 px-3 py-2">
            Note: this bill&apos;s PVC entitlement is <b>negative</b> — the correct PVC is a <b>recovery/deduction of {inr(Math.abs(result.entitlementTotal))}</b> from the contractor (prices fell below the base month). Enter what Railway settled with the matching sign (use a minus if Railway deducted it).
          </p>
        )}

        {/* Entry */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1">PVC settled by Railway (Rs.)</label>
            <Input type="number" inputMode="decimal" value={railwayTotal} placeholder="0.00"
              onChange={e => setRailwayTotal(e.target.value)} />
            <span className="text-[11px] text-muted-foreground mt-0.5 block">Minus sign if Railway deducted it from your bill.</span>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1">Railway PVC certificate / advice ref. (optional)</label>
            <Input value={railwayReference} placeholder="e.g. PVC/2025/0032/Q6"
              onChange={e => setRailwayReference(e.target.value)} />
          </div>
        </div>

        <button type="button" onClick={() => setShowComponents(v => !v)}
          className="text-xs font-semibold text-rose-600 dark:text-rose-400 flex items-center gap-1">
          {showComponents ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          {showComponents ? 'Hide component-wise entry' : 'Enter component-wise (optional, for a detailed claim)'}
        </button>

        {showComponents && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 border border-slate-100 dark:border-slate-800 rounded-2xl p-4">
            {result.rows.map(row => (
              <div key={row.key}>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">
                  {row.label} <span className="text-slate-400">(due {inr(row.entitlement)})</span>
                </label>
                <Input type="number" inputMode="decimal" placeholder="Railway paid"
                  value={components[row.railwayField] ?? ''}
                  onChange={e => setComponents(c => ({ ...c, [row.railwayField]: e.target.value }))} />
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          <Button onClick={save} disabled={saving} className="gap-1.5">
            <Save size={15} /> {saving ? 'Saving…' : 'Save & compute shortfall'}
          </Button>
          {hasRailwayData && (
            <a href={`/api/bills/${billId}/shortfall-report`} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" className="gap-1.5"><Download size={15} /> Recovery statement (PDF)</Button>
            </a>
          )}
        </div>

        {/* Result */}
        {hasRailwayData && (
          <div className="space-y-3 pt-1">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-center">
              <div className="rounded-2xl border border-slate-100 dark:border-slate-800 p-3.5">
                <span className="text-xs text-muted-foreground block">Entitlement (GCC)</span>
                <span className="font-mono font-bold text-slate-800 dark:text-slate-200 mt-1 block">{inr(entitlementTotal)}</span>
              </div>
              <div className="rounded-2xl border border-slate-100 dark:border-slate-800 p-3.5">
                <span className="text-xs text-muted-foreground block">Settled by Railway</span>
                <span className="font-mono font-bold text-slate-800 dark:text-slate-200 mt-1 block">{inr(paidTotal)}</span>
              </div>
              <div className={`rounded-2xl border p-3.5 ${resultCard.border}`}>
                <span className="text-xs text-muted-foreground block">{resultCard.label}</span>
                <span className={`font-mono font-extrabold mt-1 flex items-center justify-center gap-0.5 ${resultCard.text}`}>
                  <IndianRupee size={13} />{inr(resultCard.amount)}
                </span>
              </div>
            </div>
            {isRecoverable && (
              <p className="text-xs text-rose-600 dark:text-rose-400 font-medium text-center">
                Railway settled {Math.abs(shortfallPct).toFixed(2)}% less than the PVC due on this bill — ₹{inr(recoverable)} is recoverable.
              </p>
            )}
            {isOverSettled && (
              <p className="text-xs text-amber-700 dark:text-amber-400 font-medium text-center">
                Railway settled ₹{inr(overpaid)} more than the computed entitlement of {inr(entitlementTotal)}. This excess is at risk of being recovered from you — verify the figures before relying on it.
              </p>
            )}

            {result.hasComponentBreakdown && (
              <div className="overflow-x-auto border border-slate-100 dark:border-slate-800 rounded-2xl">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-900/50 text-xs text-muted-foreground border-b border-slate-100 dark:border-slate-800">
                      <th className="px-4 py-2 text-left font-semibold">Component</th>
                      <th className="px-4 py-2 text-right font-semibold">Entitlement</th>
                      <th className="px-4 py-2 text-right font-semibold">Railway paid</th>
                      <th className="px-4 py-2 text-right font-semibold">Shortfall</th>
                    </tr>
                  </thead>
                  <tbody className="text-xs">
                    {result.rows.map(row => (
                      <tr key={row.key} className="border-b border-slate-50 dark:border-slate-800/60 last:border-0">
                        <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300">{row.label}</td>
                        <td className="px-4 py-2 text-right font-mono">{inr(row.entitlement)}</td>
                        <td className="px-4 py-2 text-right font-mono">{row.railwayPaid != null ? inr(row.railwayPaid) : '—'}</td>
                        <td className={`px-4 py-2 text-right font-mono ${(row.shortfall ?? 0) > 0.005 ? 'text-rose-600 dark:text-rose-400 font-semibold' : ''}`}>
                          {row.shortfall != null ? inr(row.shortfall) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
