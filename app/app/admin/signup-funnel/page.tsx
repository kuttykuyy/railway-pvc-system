'use client';

/**
 * The signup funnel: who signed up, how far each got, and where they were last seen.
 */

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';

type Stage = 'signed_up' | 'email_verified' | 'signed_in' | 'contract_created' | 'bill_created' | 'paid';

interface FunnelUser {
  id: string; name: string | null; email: string; role: string; companyName: string | null; phone: boolean;
  signedUpAt: string; emailVerifiedAt: string | null; lastLoginAt: string | null;
  firstContractAt: string | null; contracts: number;
  firstBillAt: string | null; bills: number;
  firstPaidAt: string | null;
  stage: Stage;
  lastPath: string | null; lastSeenAt: string | null; trail: string[]; pageViews: number;
}

interface FunnelData {
  days: number;
  stages: Stage[];
  counts: Record<Stage, number>;
  users: FunnelUser[];
  lastSeenPages: Array<{ path: string; users: number }>;
  pageViewsAvailable: boolean;
}

const STAGE_LABEL: Record<Stage, string> = {
  signed_up: 'Signed up',
  email_verified: 'Verified email',
  signed_in: 'Signed in',
  contract_created: 'Created a contract',
  bill_created: 'Created a bill',
  paid: 'Paid for a bill',
};

const STAGE_TONE: Record<Stage, string> = {
  signed_up: 'bg-slate-100 text-slate-700',
  email_verified: 'bg-sky-100 text-sky-800',
  signed_in: 'bg-indigo-100 text-indigo-800',
  contract_created: 'bg-violet-100 text-violet-800',
  bill_created: 'bg-amber-100 text-amber-800',
  paid: 'bg-emerald-100 text-emerald-800',
};

function ago(iso: string | null): string {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.floor(h / 24)} d ago`;
}

export default function SignupFunnelPage() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<FunnelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [stageFilter, setStageFilter] = useState<Stage | 'all'>('all');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/signup-funnel?days=${days}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not load');
      setData(json);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => { load(); }, [load]);

  const total = data?.counts.signed_up || 0;
  const shown = (data?.users || []).filter(u => stageFilter === 'all' || u.stage === stageFilter);

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Signup funnel</h1>
          <p className="text-sm text-muted-foreground">
            Everyone who signed up in the window, how far they got, and the page they were last seen on.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {[7, 30, 90].map(d => (
            <button
              key={d}
              type="button"
              onClick={() => setDays(d)}
              className={`rounded-md border px-2.5 py-1 text-xs font-medium ${days === d ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'}`}
            >
              {d} days
            </button>
          ))}
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className="h-4 w-4 mr-1" />Refresh
          </Button>
        </div>
      </div>

      {data && !data.pageViewsAvailable && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Page visits are not being recorded yet — apply the <code>page_views</code> table under Admin → Pending DB changes.
          Stages still come from what each person created.
        </p>
      )}

      {/* The funnel: cumulative counts, each bar as a share of sign-ups. */}
      {data && (
        <div className="rounded-xl border bg-white p-4">
          <div className="space-y-2">
            {data.stages.map((stage, i) => {
              const n = data.counts[stage] || 0;
              const prev = i === 0 ? n : data.counts[data.stages[i - 1]] || 0;
              const pct = total > 0 ? (n / total) * 100 : 0;
              const stepPct = prev > 0 ? (n / prev) * 100 : 0;
              return (
                <button
                  key={stage}
                  type="button"
                  onClick={() => setStageFilter(stageFilter === stage ? 'all' : stage)}
                  className={`w-full text-left rounded-lg px-2 py-1.5 hover:bg-slate-50 ${stageFilter === stage ? 'ring-1 ring-emerald-300 bg-emerald-50/40' : ''}`}
                  title="Click to list the people whose furthest step this is"
                >
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-medium text-slate-800">{STAGE_LABEL[stage]}</span>
                    <span className="tabular-nums text-slate-600">
                      {n} <span className="text-slate-400">· {pct.toFixed(0)}% of sign-ups{i > 0 ? ` · ${stepPct.toFixed(0)}% of previous` : ''}</span>
                    </span>
                  </div>
                  <div className="h-2.5 rounded bg-slate-100 overflow-hidden">
                    <div className="h-full rounded bg-emerald-500" style={{ width: `${pct}%` }} />
                  </div>
                </button>
              );
            })}
          </div>
          {data.lastSeenPages.length > 0 && (
            <div className="mt-4 border-t pt-3">
              <p className="text-xs font-semibold text-slate-700 mb-1.5">Where people who have not paid were last seen</p>
              <div className="flex flex-wrap gap-1.5">
                {data.lastSeenPages.map(p => (
                  <span key={p.path} className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-mono text-slate-700">
                    {p.path} <span className="text-slate-400">×{p.users}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* One row per person. */}
      <div className="rounded-xl border bg-white overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-3 py-2 text-left font-semibold">Person</th>
              <th className="px-3 py-2 text-left font-semibold">Signed up</th>
              <th className="px-3 py-2 text-left font-semibold">Got as far as</th>
              <th className="px-3 py-2 text-left font-semibold">Contracts · bills</th>
              <th className="px-3 py-2 text-left font-semibold">Last seen</th>
              <th className="px-3 py-2 text-left font-semibold">Path taken (latest first)</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {!loading && shown.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">Nobody in this window{stageFilter !== 'all' ? ' at this step' : ''}.</td></tr>
            )}
            {shown.map(u => (
              <tr key={u.id} className="align-top hover:bg-slate-50/60">
                <td className="px-3 py-2">
                  <div className="font-medium text-slate-900">{u.name || '(no name)'}</div>
                  <div className="text-slate-500">{u.email}</div>
                  <div className="text-[10px] text-slate-400">{u.role}{u.companyName ? ` · ${u.companyName}` : ''}{u.phone ? '' : ' · no mobile'}</div>
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-slate-700">
                  {new Date(u.signedUpAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                  <div className="text-[10px] text-slate-400">{ago(u.signedUpAt)}</div>
                </td>
                <td className="px-3 py-2">
                  <span className={`inline-block rounded-full px-2 py-0.5 font-semibold ${STAGE_TONE[u.stage]}`}>{STAGE_LABEL[u.stage]}</span>
                  {!u.emailVerifiedAt && <div className="mt-1 text-[10px] text-rose-600">Email not verified</div>}
                  {u.emailVerifiedAt && !u.lastLoginAt && <div className="mt-1 text-[10px] text-amber-700">Verified, never signed in</div>}
                </td>
                <td className="px-3 py-2 whitespace-nowrap tabular-nums text-slate-700">{u.contracts} · {u.bills}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {u.lastPath ? (
                    <>
                      <div className="font-mono text-slate-800">{u.lastPath}</div>
                      <div className="text-[10px] text-slate-400">{ago(u.lastSeenAt)} · {u.pageViews} page{u.pageViews === 1 ? '' : 's'}</div>
                    </>
                  ) : (
                    <span className="text-slate-400">{u.lastLoginAt ? `signed in ${ago(u.lastLoginAt)}` : 'never seen'}</span>
                  )}
                </td>
                <td className="px-3 py-2 font-mono text-[11px] text-slate-600 max-w-[26rem]">
                  {u.trail.length ? u.trail.join(' ← ') : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
