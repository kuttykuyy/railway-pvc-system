'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { HardDrive, RefreshCw, AlertTriangle, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';

interface Status {
  total: number;
  inDatabase: number;
  inObjectStorage: number;
  message: string;
}

/**
 * Moving component index documents out of object storage.
 *
 * A page rather than a curl command: these endpoints need an admin session, which a
 * request typed into a terminal does not carry, and the browser is already signed in.
 */
export default function StoragePage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [moving, setMoving] = useState(false);
  const [failures, setFailures] = useState<Array<{ fileName: string; reason: string }>>([]);

  const check = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/index-documents-to-db');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Check failed');
      setStatus(data);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { check(); }, [check]);

  const move = async () => {
    setMoving(true);
    setFailures([]);
    try {
      const res = await fetch('/api/admin/index-documents-to-db', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Move failed');
      setFailures(data.failed || []);
      if (data.moved > 0) toast.success(data.message);
      else toast(data.message);
      await check();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setMoving(false);
    }
  };

  const stillInStorage = status ? status.inObjectStorage : 0;

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <div className="flex items-center gap-2">
        <HardDrive className="h-5 w-5 text-slate-600" />
        <h1 className="text-xl font-semibold">Storage</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Component index documents</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-slate-600 leading-relaxed">
            An index document is embedded into every statement that cites it. Kept in object
            storage it is downloaded again for each one, and each download is billed as egress —
            which is what exhausted the quota and stopped uploads. Kept in the database it is read
            over a connection already open, at no egress, however many statements embed it.
          </p>

          {status && (
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-md border border-slate-200 p-3">
                <div className="text-xl font-semibold text-slate-800">{status.total}</div>
                <div className="text-xs text-slate-500">documents</div>
              </div>
              <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3">
                <div className="text-xl font-semibold text-emerald-800">{status.inDatabase}</div>
                <div className="text-xs text-emerald-700">in the database</div>
              </div>
              <div className={`rounded-md border p-3 ${stillInStorage > 0 ? 'border-amber-200 bg-amber-50' : 'border-slate-200'}`}>
                <div className={`text-xl font-semibold ${stillInStorage > 0 ? 'text-amber-800' : 'text-slate-800'}`}>
                  {stillInStorage}
                </div>
                <div className={`text-xs ${stillInStorage > 0 ? 'text-amber-700' : 'text-slate-500'}`}>in object storage</div>
              </div>
            </div>
          )}

          {loading ? (
            <p className="text-sm text-slate-500">Checking…</p>
          ) : stillInStorage === 0 ? (
            <div className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
              <div className="text-sm text-emerald-900">
                Nothing to move — no statement downloads an index document.
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-4 py-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-sm text-amber-900">
                Each of these is downloaded again by every statement that embeds it. Moving them
                costs one last download each, and none afterwards.
                <span className="block mt-1 text-xs text-amber-800">
                  If storage is restricted for exceeding its quota, clear that first — a restricted
                  project refuses downloads as well as uploads, so nothing can move until it is lifted.
                </span>
              </div>
            </div>
          )}

          {failures.length > 0 && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 space-y-1">
              <p className="text-xs font-medium text-red-900">{failures.length} could not be moved:</p>
              <ul className="text-[11px] text-red-800 space-y-0.5">
                {failures.map((failure, index) => (
                  <li key={index}><span className="font-medium">{failure.fileName}</span> — {failure.reason}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex gap-2">
            <Button onClick={move} disabled={moving || loading || stillInStorage === 0}>
              {moving ? 'Moving…' : 'Move into the database'}
            </Button>
            <Button variant="outline" onClick={check} disabled={loading || moving}>
              <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} /> Re-check
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
