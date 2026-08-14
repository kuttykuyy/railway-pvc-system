'use client';

/**
 * The reader's failure queue. Every PDF that would not read sits here with its exact
 * error — download it, get it fixed, delete the row. What used to be "please send this
 * PDF to support" is now a table that filled itself.
 */

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Download, Trash2, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';

interface Failure {
  id: number;
  createdAt: string;
  userEmail: string | null;
  fileName: string | null;
  error: string;
  hasPdf: boolean;
}

export default function ParseFailuresPage() {
  const [failures, setFailures] = useState<Failure[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/parse-failures');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not load');
      setFailures(data.failures || []);
      setNote(data.note || null);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const remove = async (id: number) => {
    if (!confirm('Delete this failure record (and its stored PDF)?')) return;
    const res = await fetch(`/api/admin/parse-failures?id=${id}`, { method: 'DELETE' });
    if (res.ok) { toast.success('Deleted'); load(); }
    else toast.error('Could not delete');
  };

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Parse failures</h1>
          <p className="text-sm text-muted-foreground">
            PDFs the bill reader could not read, collected automatically with their exact errors.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className="h-4 w-4 mr-1" />Refresh
        </Button>
      </div>

      {note && <p className="text-sm text-amber-700">{note}</p>}
      {!loading && failures.length === 0 && !note && (
        <p className="text-sm text-muted-foreground">No failures collected — the reader is holding.</p>
      )}

      <div className="space-y-3">
        {failures.map(f => (
          <div key={f.id} className="border rounded-lg p-3 bg-white">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">{f.fileName || '(unnamed PDF)'}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(f.createdAt).toLocaleString('en-IN')} · {f.userEmail || 'unknown user'}
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                {f.hasPdf && (
                  <Button asChild variant="outline" size="sm">
                    <a href={`/api/admin/parse-failures?id=${f.id}`}>
                      <Download className="h-4 w-4 mr-1" />PDF
                    </a>
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={() => remove(f.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <pre className="mt-2 text-xs text-red-800 bg-red-50 border border-red-100 rounded p-2 whitespace-pre-wrap max-h-40 overflow-y-auto">{f.error}</pre>
          </div>
        ))}
      </div>
    </div>
  );
}
