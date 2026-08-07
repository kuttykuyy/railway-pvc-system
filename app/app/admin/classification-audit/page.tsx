'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle2, AlertTriangle, RefreshCw, Percent, Wrench } from 'lucide-react';
import { toast } from 'react-hot-toast';
import type { ClassificationAudit } from '@/lib/classification-audit';

/**
 * Checks the component percentages the app prices with against the GCC 46A.6 table.
 * A single wrong figure changes every PVC computed under that classification, and
 * nothing else in the app would ever mention it.
 */
export default function ClassificationAuditPage() {
  const [audit, setAudit] = useState<ClassificationAudit | null>(null);
  const [loading, setLoading] = useState(true);
  const [repairing, setRepairing] = useState(false);

  const check = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/classification-audit');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Check failed');
      setAudit(data);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { check(); }, [check]);

  const repair = async () => {
    if (!window.confirm(
      'Put every drifted classification back to the GCC figures?\n\n'
      + 'Only the eight percentages change; names and groups are untouched. Bills already '
      + 'calculated keep their saved PVC until they are regenerated.',
    )) return;
    setRepairing(true);
    try {
      const res = await fetch('/api/admin/classification-audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Restore failed');
      toast.success(data.message, { duration: 6000 });
      setAudit(data.audit);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setRepairing(false);
    }
  };

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <div className="flex items-center gap-2">
        <Percent className="h-5 w-5 text-slate-600" />
        <h1 className="text-xl font-semibold">Classification percentages</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Against the GCC 46A.6 table</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-slate-600 leading-relaxed">
            These eight percentages decide every PVC the app computes. They were seeded from the
            printed GCC table — verified row by row, all 35 — and can be edited since. Anything that
            has drifted is changing figures quietly, so this compares what is live against the table.
          </p>

          {loading && <p className="text-sm text-slate-500">Checking…</p>}

          {audit && !loading && (
            <>
              {audit.clean ? (
                <div className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-emerald-900">Everything matches</p>
                    <p className="text-xs text-emerald-700 mt-0.5">
                      All {audit.liveCount} live classifications carry the GCC percentages, and every
                      row adds to 100.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-4 py-3">
                  <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-amber-900">
                      {audit.drifted.length} classification(s) differ from the GCC table
                    </p>
                    <p className="text-xs text-amber-800 mt-0.5">
                      Every bill priced under these carries the difference.
                    </p>
                  </div>
                </div>
              )}

              {audit.drifted.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-slate-700">Drifted from the GCC table</p>
                  {audit.drifted.map(row => (
                    <div key={row.code} className="rounded-md border border-slate-200 p-3 text-xs">
                      <p className="font-semibold text-slate-800">{row.code} — {row.name}</p>
                      <table className="mt-1.5 w-full">
                        <thead>
                          <tr className="text-slate-400 text-left">
                            <th className="font-medium">Component</th>
                            <th className="font-medium">GCC</th>
                            <th className="font-medium">Live</th>
                          </tr>
                        </thead>
                        <tbody>
                          {row.drift.map(d => (
                            <tr key={d.component}>
                              <td className="text-slate-600">{d.label}</td>
                              <td className="text-emerald-700 font-medium">{d.gcc}%</td>
                              <td className="text-amber-700 font-medium">{d.live}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>
              )}

              {audit.badTotals.length > 0 && (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-xs">
                  <p className="font-semibold text-red-900">Rows that do not add to 100%</p>
                  <ul className="mt-1 space-y-0.5 text-red-800">
                    {audit.badTotals.map(r => (
                      <li key={r.code}><code>{r.code}</code> — {r.liveTotal}%</li>
                    ))}
                  </ul>
                  <p className="mt-1.5 text-red-700">
                    A row that does not add to 100 prices a share of the bill as neither varying nor fixed.
                  </p>
                </div>
              )}

              {audit.missing.length > 0 && (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs">
                  <p className="font-semibold text-amber-900">In the GCC table but missing here</p>
                  <p className="mt-1 font-mono text-amber-800">{audit.missing.join(', ')}</p>
                  <p className="mt-1.5 text-amber-700">Nothing can be classified as these.</p>
                </div>
              )}

              {audit.unknown.length > 0 && (
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs">
                  <p className="font-semibold text-slate-700">Codes the clause does not define</p>
                  <p className="mt-1 font-mono text-slate-600">{audit.unknown.map(u => u.code).join(', ')}</p>
                  <p className="mt-1.5 text-slate-500">
                    Left alone — they may be deliberate local additions. Their totals are still checked.
                  </p>
                </div>
              )}

              <div className="flex flex-wrap gap-2 pt-1">
                <Button variant="outline" onClick={check} disabled={loading || repairing}>
                  <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} /> Re-check
                </Button>
                {audit.drifted.length > 0 && (
                  <Button onClick={repair} disabled={repairing}>
                    <Wrench className="h-4 w-4 mr-1.5" />
                    {repairing ? 'Restoring…' : 'Restore the GCC figures'}
                  </Button>
                )}
              </div>

              <p className="text-xs text-slate-400">
                Restoring changes the percentages only. Bills already calculated keep their saved PVC
                until they are regenerated.
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
