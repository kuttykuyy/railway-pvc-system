'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle2, AlertTriangle, Database, RefreshCw } from 'lucide-react';

interface PendingColumnStatus {
  table: string;
  column: string;
  why: string;
  exists: boolean;
}

/**
 * Admin screen to apply pending additive schema changes without the production
 * DATABASE_URL, which Vercel keeps sensitive. The deployed app already holds that
 * connection. The list comes from the API so this page never goes stale.
 */
export default function PendingDbChangePage() {
  const [exists, setExists] = useState<boolean | null>(null);
  const [columns, setColumns] = useState<PendingColumnStatus[]>([]);
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
      setColumns(data.columns || []);
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
          <CardTitle className="text-base">Pending columns</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-slate-600 leading-relaxed">
            These columns ship as migrations, but applying them normally needs the production
            database URL, which Vercel keeps hidden. The app already holds that connection, so it
            can add them here. Each is a single additive column — nothing is dropped or changed.
          </p>
          {columns.length > 0 && (
            <ul className="text-xs space-y-1.5">
              {columns.map((c) => (
                <li key={`${c.table}.${c.column}`} className="flex items-start gap-2">
                  {c.exists
                    ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0 mt-0.5" />
                    : <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />}
                  <span className={c.exists ? 'text-slate-400' : 'text-slate-600'}>
                    <code className="font-medium">{c.table}.{c.column}</code>
                    {c.exists ? ' — already applied' : ''}
                    <span className="block text-slate-400">{c.why}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}

          {loading ? (
            <p className="text-sm text-slate-500">Checking…</p>
          ) : exists ? (
            <div className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-emerald-900">All applied</p>
                <p className="text-xs text-emerald-700 mt-0.5">Nothing to do — every column is present.</p>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-4 py-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-900">Some columns missing</p>
                <p className="text-xs text-amber-700 mt-0.5">
                  Adds the missing columns with safe defaults. Creates nothing else, changes no existing data, and is safe to run twice.
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
