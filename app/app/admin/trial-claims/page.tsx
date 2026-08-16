'use client';

/**
 * Which agreements have used their one free bill.
 *
 * The rule is one free bill per agreement number across every account, so deleting an
 * account and signing up again cannot earn another. It is right, and it is invisible:
 * a contractor whose agreement was already claimed is simply refused, and until this
 * screen there was no way to see that, let alone act on it.
 */

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { RefreshCw, Unlock, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';

interface Claim {
  id: string;
  agreementNo: string;
  claimedAt: string;
  claimedByEmail: string | null;
  claimedByName: string | null;
  claimerDeleted: boolean;
  contractId: string | null;
  contractorName: string | null;
}

export default function TrialClaimsPage() {
  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);
  const [releasing, setReleasing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/trial-claims');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not load');
      setClaims(data.claims || []);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const release = async (claim: Claim) => {
    const ok = window.confirm(
      `Release ${claim.agreementNo}?\n\n`
      + 'That agreement will be able to take another free bill. Do this when the claim '
      + 'is blocking a genuine customer — not to give a second free bill to someone who '
      + 'has already had one.',
    );
    if (!ok) return;
    setReleasing(claim.id);
    try {
      const res = await fetch(`/api/admin/trial-claims?id=${encodeURIComponent(claim.id)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not release it');
      toast.success(data.message);
      setClaims((prev) => prev.filter((c) => c.id !== claim.id));
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setReleasing(null);
    }
  };

  const orphaned = claims.filter((c) => c.claimerDeleted).length;

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Free bills already used</h1>
          <p className="text-sm text-slate-500 mt-1">
            One free bill per agreement number, across every account. An agreement listed
            here has had its free bill, so the next person to upload a bill against it is
            asked to pay.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      {orphaned > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 flex gap-2">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            {orphaned} {orphaned === 1 ? 'claim was' : 'claims were'} made by an account that
            has since been deleted. They still count — that is what stops someone deleting
            their account to earn another free bill — but if one is blocking a real
            customer, release it here.
          </span>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-slate-500 py-10 text-center">Loading…</p>
      ) : claims.length === 0 ? (
        <p className="text-sm text-slate-500 py-10 text-center">
          No agreement has used a free bill yet.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {['Agreement number', 'Free bill taken by', 'When', ''].map((h) => (
                  <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {claims.map((claim) => (
                <tr key={claim.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900 break-all">
                    {claim.agreementNo}
                    {claim.contractorName && (
                      <span className="block text-xs font-normal text-slate-500">{claim.contractorName}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {claim.claimerDeleted ? (
                      <span className="text-amber-700">account since deleted</span>
                    ) : (
                      <>
                        {claim.claimedByEmail}
                        {claim.claimedByName && (
                          <span className="block text-xs text-slate-500">{claim.claimedByName}</span>
                        )}
                      </>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                    {new Date(claim.claimedAt).toLocaleDateString('en-IN', {
                      day: 'numeric', month: 'short', year: 'numeric',
                    })}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => release(claim)}
                      disabled={releasing === claim.id}
                    >
                      <Unlock className="h-3.5 w-3.5 mr-1.5" />
                      {releasing === claim.id ? 'Releasing…' : 'Release'}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
