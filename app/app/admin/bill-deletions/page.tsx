'use client';

/**
 * Every bill that was deleted, and the facts for judging it: was it the free-trial bill,
 * how long did it live, who deleted it, how many the same account has deleted.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { RefreshCw, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';

interface Deletion {
  id: number;
  deletedAt: string;
  billNo: string | null;
  agreementNo: string | null;
  ownerEmail: string | null;
  deletedByEmail: string | null;
  deletedByRole: string | null;
  ownerUserId: string | null;
  deletedByUserId: string;
  wasFree: boolean;
  freeReason: string | null;
  chargedAmount: number;
  billAmount: number | null;
  totalPvc: number | null;
  dateOfMeasurement: string | null;
  billCreatedAt: string | null;
  ageMinutes: number | null;
  ownerDeletions: number;
}

function age(min: number | null): string {
  if (min === null) return '—';
  if (min < 60) return `${min} min`;
  if (min < 48 * 60) return `${Math.round(min / 60)} h`;
  return `${Math.round(min / 1440)} d`;
}

export default function BillDeletionsPage() {
  const router = useRouter();
  const [rows, setRows] = useState<Deletion[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/bill-deletions');
      if (res.status === 403) { router.push('/dashboard'); return; }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not load');
      setRows(data.deletions || []);
      setNote(data.note || null);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Bill deletions</h1>
          <p className="text-sm text-muted-foreground">
            Bills are removed for good when deleted; this is the record that stays. A free-trial bill deleted young is flagged.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className="h-4 w-4 mr-1" />Refresh
        </Button>
      </div>

      {note && <p className="text-sm text-amber-700">{note}</p>}
      {!loading && rows.length === 0 && !note && (
        <p className="text-sm text-muted-foreground">No deletions recorded yet.</p>
      )}

      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-lg border bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Deleted</th>
                <th className="px-3 py-2">Owner</th>
                <th className="px-3 py-2">Agreement · Bill</th>
                <th className="px-3 py-2">Paid?</th>
                <th className="px-3 py-2">Lived</th>
                <th className="px-3 py-2 text-right">PVC</th>
                <th className="px-3 py-2">Deleted by</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const suspicious = r.wasFree && r.ageMinutes !== null && r.ageMinutes < 24 * 60;
                const repeat = r.ownerDeletions > 1;
                return (
                  <tr key={r.id} className={`border-t ${suspicious ? 'bg-amber-50/60' : ''}`}>
                    <td className="px-3 py-2 whitespace-nowrap text-slate-600">{new Date(r.deletedAt).toLocaleString('en-IN')}</td>
                    <td className="px-3 py-2">
                      <div className="font-medium text-slate-900">{r.ownerEmail || r.ownerUserId || '—'}</div>
                      {repeat && <div className="text-[11px] text-amber-700">{r.ownerDeletions} deletions in this list</div>}
                    </td>
                    <td className="px-3 py-2 text-slate-700">
                      <div>{r.agreementNo || '—'}</div>
                      <div className="text-xs text-slate-500">Bill {r.billNo || '?'}{r.dateOfMeasurement ? ` · measured ${new Date(r.dateOfMeasurement).toLocaleDateString('en-IN')}` : ''}</div>
                    </td>
                    <td className="px-3 py-2">
                      {r.wasFree
                        ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">FREE · {r.freeReason || 'free'}</span>
                        : <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">₹{Math.round(r.chargedAmount)}</span>}
                    </td>
                    <td className="px-3 py-2 text-slate-700">{age(r.ageMinutes)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-700">{r.totalPvc !== null ? `₹${Math.round(r.totalPvc).toLocaleString('en-IN')}` : '—'}</td>
                    <td className="px-3 py-2 text-slate-600">
                      {r.deletedByUserId === r.ownerUserId ? 'owner' : (r.deletedByEmail || r.deletedByRole || 'admin')}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="flex items-center gap-1.5 text-xs text-slate-500"><Trash2 className="h-3.5 w-3.5" /> Deleting a bill never returns a free trial; the counter and the agreement claim stay used.</p>
    </div>
  );
}
