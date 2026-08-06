'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { CheckCircle2, Undo2, FileText, Loader2, IndianRupee, Building2 } from 'lucide-react';
import { format } from 'date-fns';
import { toISTDate } from '@/lib/ist-utils';

interface AwaitingBill {
  id: string;
  billNo: string;
  quarter: string;
  dateOfMeasurement: string;
  grossBillAmount: number;
  approvedAt: string | null;
  contract?: { agreementNo: string; contractorName: string; workDescription?: string };
  pvcCalculation?: { totalPvc: number; cumulativePvc: number } | null;
  approvedByUser?: { name: string | null; email: string; designation?: string | null } | null;
}

interface PassedBill {
  id: string;
  billNo: string;
  passedAt: string | null;
  contract?: { agreementNo: string; contractorName: string };
  pvcCalculation?: { totalPvc: number } | null;
  passedByUser?: { name: string | null; email: string } | null;
}

const money = (value: number | undefined | null) =>
  `${(value ?? 0) < 0 ? '−' : ''}₹${Math.abs(Number(value) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const day = (value: string | null | undefined) =>
  value ? format(toISTDate(new Date(value)), 'dd MMM yyyy') : '—';

export function AccountsInboxClient({
  awaiting,
  passed,
  zoneLabel,
}: {
  awaiting: AwaitingBill[];
  passed: PassedBill[];
  zoneLabel: string;
}) {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);
  const [mode, setMode] = useState<'pass' | 'return'>('pass');
  const [comments, setComments] = useState('');
  const [busy, setBusy] = useState(false);

  const act = async (billId: string, action: 'pass' | 'return') => {
    if (action === 'return' && !comments.trim()) {
      toast.error('Please give the reason for returning the proposal.');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/bills/approval/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ billId, action, comments: comments.trim() || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not record the decision');
      toast.success(action === 'pass' ? 'Passed for payment' : 'Returned to the executive stage');
      setOpenId(null);
      setComments('');
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || 'Could not record the decision');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="w-full px-4 py-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Accounts / Audit</h1>
        <p className="text-sm text-gray-500 mt-1">
          PVC proposals approved by the executive and waiting to be vetted{zoneLabel ? ` — ${zoneLabel}` : ''}.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-700">
          Awaiting vetting <span className="text-gray-400 font-normal">({awaiting.length})</span>
        </h2>

        {awaiting.length === 0 && (
          <div className="rounded-lg border border-dashed border-gray-200 p-8 text-center text-sm text-gray-500">
            Nothing waiting. Proposals appear here once the executive side approves them.
          </div>
        )}

        {awaiting.map((bill) => (
          <div key={bill.id} className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                  <FileText className="h-4 w-4 text-emerald-600 shrink-0" />
                  Bill {bill.billNo}
                  <span className="text-xs font-normal text-gray-400">Quarter {bill.quarter}</span>
                </div>
                <p className="text-xs text-gray-500 mt-1 flex items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5" />
                  {bill.contract?.agreementNo} — {bill.contract?.contractorName}
                </p>
                {bill.contract?.workDescription && (
                  <p className="text-xs text-gray-400 mt-1 line-clamp-1">{bill.contract.workDescription}</p>
                )}
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-400 uppercase tracking-wide">PVC claimed</p>
                <p className="text-base font-bold text-gray-900 flex items-center justify-end gap-1">
                  <IndianRupee className="h-4 w-4 text-gray-400" />
                  {money(bill.pvcCalculation?.totalPvc).replace('₹', '')}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs text-gray-600 border-t border-gray-100 pt-3">
              <div><span className="block text-gray-400">Measured</span>{day(bill.dateOfMeasurement)}</div>
              <div><span className="block text-gray-400">Gross bill</span>{money(bill.grossBillAmount)}</div>
              <div><span className="block text-gray-400">Approved on</span>{day(bill.approvedAt)}</div>
              <div className="truncate">
                <span className="block text-gray-400">Approved by</span>
                {bill.approvedByUser?.name || bill.approvedByUser?.email || '—'}
              </div>
            </div>

            {openId === bill.id ? (
              <div className="space-y-2 border-t border-gray-100 pt-3">
                <Textarea
                  value={comments}
                  onChange={(e) => setComments(e.target.value)}
                  rows={3}
                  placeholder={mode === 'pass'
                    ? 'Remarks (optional) — e.g. indices verified against the published pages'
                    : 'Reason for returning — what the executive side needs to answer'}
                  className="text-sm"
                />
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" disabled={busy} onClick={() => act(bill.id, mode)}
                    className={mode === 'pass' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-amber-600 hover:bg-amber-700'}>
                    {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                    {mode === 'pass' ? 'Confirm — pass for payment' : 'Confirm — return'}
                  </Button>
                  <Button size="sm" variant="outline" disabled={busy}
                    onClick={() => { setOpenId(null); setComments(''); }}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2 border-t border-gray-100 pt-3">
                <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700"
                  onClick={() => { setOpenId(bill.id); setMode('pass'); setComments(''); }}>
                  <CheckCircle2 className="h-4 w-4 mr-2" /> Pass for payment
                </Button>
                <Button size="sm" variant="outline"
                  onClick={() => { setOpenId(bill.id); setMode('return'); setComments(''); }}>
                  <Undo2 className="h-4 w-4 mr-2" /> Return with a query
                </Button>
                <Link href={`/bills/${bill.id}`} className="ml-auto">
                  <Button size="sm" variant="ghost">Open the statement</Button>
                </Link>
              </div>
            )}
          </div>
        ))}
      </section>

      {passed.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-700">Recently passed for payment</h2>
          <div className="rounded-lg border border-gray-200 bg-white divide-y divide-gray-100">
            {passed.map((bill) => (
              <div key={bill.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                <div className="min-w-0">
                  <Link href={`/bills/${bill.id}`} className="font-medium text-gray-900 hover:underline">
                    {bill.billNo}
                  </Link>
                  <span className="text-xs text-gray-500 ml-2">
                    {bill.contract?.agreementNo} — {bill.contract?.contractorName}
                  </span>
                </div>
                <div className="text-xs text-gray-500">
                  {money(bill.pvcCalculation?.totalPvc)} · passed {day(bill.passedAt)}
                  {bill.passedByUser?.name ? ` by ${bill.passedByUser.name}` : ''}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
