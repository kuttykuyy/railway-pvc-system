'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle2, AlertTriangle, Database, RefreshCw } from 'lucide-react';

/**
 * One-time admin screen to apply the pending Bill.railwaySuppliedMaterialValue column
 * without needing the production DATABASE_URL (Vercel keeps it sensitive).
 */
export default function PendingDbChangePage() {
  const [exists, setExists] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const check = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/apply-railway-material-column');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Check failed');
      setExists(data.exists);
      setMessage(data.message);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const apply = async () => {
    setApplying(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/apply-railway-material-column', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setMessage(data.message);
      await check();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setApplying(false);
    }
  };

  useEffect(() => { check(); }, []);

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <div className="flex items-center gap-2">
        <Database className="h-5 w-5 text-slate-600" />
        <h1 className="text-xl font-semibold">Pending database change</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Railway-supplied material column</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-slate-600 leading-relaxed">
            GCC-2022 Clause 46A excludes the cost of materials supplied by the Railway from the
            PVC base. Storing the entered value needs one extra column on the bills table. The
            calculation already works without it — only the recorded figure depends on this.
          </p>

          {loading ? (
            <p className="text-sm text-slate-500">Checking…</p>
          ) : exists ? (
            <div className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-emerald-900">Already applied</p>
                <p className="text-xs text-emerald-700 mt-0.5">Nothing to do — the column is present.</p>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-4 py-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-900">Not applied yet</p>
                <p className="text-xs text-amber-700 mt-0.5">
                  Adds one column with a default of 0. It creates nothing else, changes no existing
                  data, and is safe to run twice.
                </p>
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
          )}
          {message && !error && !loading && (
            <p className="text-xs text-slate-500">{message}</p>
          )}

          <div className="flex gap-2">
            <Button onClick={apply} disabled={applying || loading || exists === true}>
              {applying ? 'Applying…' : 'Apply now'}
            </Button>
            <Button variant="outline" onClick={check} disabled={loading || applying}>
              <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} /> Re-check
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
