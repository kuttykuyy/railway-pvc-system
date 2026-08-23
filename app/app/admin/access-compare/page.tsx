'use client';

/**
 * Reads the phase-2 safety net: disagreements between the old bill-access id-list and
 * the new database predicate, recorded on real logins. Silence here for a while is what
 * lets the old path be deleted; an entry is a bug to read first.
 */

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { RefreshCw, ShieldCheck, Trash2 } from 'lucide-react';
import { toast } from 'react-hot-toast';

interface Mismatch {
  at: string;
  userId: string;
  label: string;
  summary: string;
  detail: Record<string, unknown>;
}

export default function AccessComparePage() {
  const [items, setItems] = useState<Mismatch[]>([]);
  const [lastWrittenAt, setLastWrittenAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/access-compare');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not load');
      setItems(data.mismatches || []);
      setLastWrittenAt(data.lastWrittenAt || null);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  const clear = async () => {
    if (!confirm('Clear the recorded mismatches and start a fresh observation period?')) return;
    const res = await fetch('/api/admin/access-compare', { method: 'DELETE' });
    if (res.ok) { toast.success('Cleared'); load(); } else toast.error('Could not clear');
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><ShieldCheck className="h-6 w-6 text-emerald-600" /> Bill access — old vs new</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-[70ch]">
            Who may see which bills is now decided by a database condition instead of a list of ids.
            Every time someone opens the bills list or a bulk report, both ways are run for them and
            compared. Anything they disagree on is recorded here. <b>An empty list over a week or two of
            real use is the proof the new rule is faithful;</b> any entry is a bug to read before trusting it.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}><RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} /> Refresh</Button>
          <Button variant="outline" size="sm" onClick={clear} disabled={items.length === 0}><Trash2 className="h-4 w-4 mr-1.5" /> Clear</Button>
        </div>
      </div>

      {!loading && items.length === 0 && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          No disagreements recorded. {lastWrittenAt ? `Last write ${new Date(lastWrittenAt).toLocaleString('en-IN')}.` : 'Nothing has been written yet — the check runs on each bills-list load.'}
        </div>
      )}

      {items.length > 0 && (
        <div className="space-y-3">
          <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <b>{items.length} {items.length === 1 ? 'disagreement' : 'disagreements'} recorded.</b> The new rule and the old list did not see the same bills for these people. Read before trusting the new path.
          </div>
          {items.map((m, i) => (
            <div key={i} className="rounded-xl border border-gray-200 bg-white p-4 text-sm">
              <div className="flex flex-wrap justify-between gap-2">
                <span className="font-semibold">{m.summary}</span>
                <span className="text-muted-foreground">{new Date(m.at).toLocaleString('en-IN')} · {m.label}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1 font-mono">user {m.userId}</p>
              <pre className="mt-2 text-xs bg-gray-50 border border-gray-100 rounded p-2 overflow-x-auto">{JSON.stringify(m.detail, null, 2)}</pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
