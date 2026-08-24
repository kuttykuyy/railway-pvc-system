'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, CheckCircle2, Loader2, Phone, RefreshCw } from 'lucide-react';

/**
 * Settling mobile numbers that belong to more than one account, with buttons.
 *
 * The API behind this could always do the work, but only by hand — pasting fetch calls
 * into a browser console. That is not a thing to ask of anybody for an operation that
 * clears a real person's phone number, and predictably it did not get done: the report
 * came back byte-identical after the "cleanup".
 *
 * The order is the whole point and the page enforces it. Settle the shared numbers, then
 * normalise the stored formats, then apply the unique index — which is a separate screen
 * and stays that way, because it is the irreversible one.
 */

interface Account {
  email: string;
  name: string | null;
  stored: string;
  contracts: number;
  createdAt: string;
}

interface Report {
  totalWithPhone: number;
  needsRewrite: number;
  safeToRewrite: number;
  blockedByConflict: number;
  unreadable: Array<{ id: string; email: string; stored: string }>;
  sharedNumbers: Array<{ number: string; accounts: Account[] }>;
  readyForUniqueIndex: boolean;
  nextStep: string;
}

export default function AdminPhoneNumbersPage() {
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/phone-numbers');
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not read the report');
      setReport(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const settle = async (number: string, keepEmail: string, clearedCount: number) => {
    if (!confirm(
      `Keep ${number} on ${keepEmail}?\n\n`
      + `The other ${clearedCount} account${clearedCount === 1 ? '' : 's'} will have `
      + `no mobile number, and will be asked for a new one — verified by WhatsApp code — `
      + `on their next visit. Admins and railway officials are not asked.`,
    )) return;

    setBusy(number);
    setError(null);
    setDone(null);
    try {
      const response = await fetch('/api/admin/phone-numbers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ number, keepEmail }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not settle that number');
      setDone(`${data.number} kept by ${data.keptBy}; cleared from ${data.clearedFrom.length}.`);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };

  const normalise = async () => {
    if (!report) return;
    if (!confirm(
      `Rewrite ${report.safeToRewrite} number${report.safeToRewrite === 1 ? '' : 's'} `
      + `into one format? Nobody loses their number — the same number is simply stored `
      + `the same way everywhere.`,
    )) return;

    setBusy('normalise');
    setError(null);
    setDone(null);
    try {
      const response = await fetch('/api/admin/phone-numbers', { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not normalise');
      setDone(`${data.rewritten} number${data.rewritten === 1 ? '' : 's'} rewritten.`);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };

  const shared = report?.sharedNumbers ?? [];

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <div className="flex items-center gap-2">
        <Phone className="h-5 w-5 text-slate-600" />
        <h1 className="text-xl font-semibold">Mobile numbers</h1>
      </div>

      <p className="text-sm text-slate-600 leading-relaxed">
        A mobile number identifies an account — the WhatsApp bot finds a person&apos;s
        contracts by it. Numbers used to be stored exactly as typed and were never checked
        against anybody else&apos;s, so the same number can sit on several accounts in
        several spellings. Settle those here, then put every number in one format, then
        apply the unique index under <span className="font-medium">Pending DB changes</span>.
      </p>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}
      {done && !error && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{done}</div>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Where things stand</CardTitle>
          <Button variant="outline" size="sm" onClick={load} disabled={loading || !!busy}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} /> Re-check
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading && !report ? (
            <p className="text-sm text-slate-500">Reading…</p>
          ) : report ? (
            <>
              <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                {[
                  ['Accounts with a number', report.totalWithPhone],
                  ['Shared between accounts', shared.length],
                  ['Need one format', report.needsRewrite],
                  ['Unreadable', report.unreadable.length],
                ].map(([label, value]) => (
                  <div key={String(label)}>
                    <dt className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold">{label}</dt>
                    <dd className="font-semibold text-slate-800">{value}</dd>
                  </div>
                ))}
              </dl>
              <p className="text-xs text-slate-500">{report.nextStep}</p>
            </>
          ) : null}
        </CardContent>
      </Card>

      {shared.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              Numbers on more than one account
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-slate-500">
              Choose which account keeps each number. The others are left without one and
              are asked for a new one, verified by WhatsApp code, next time they visit.
              Contract counts are shown because they are usually the tell — the account
              with the work is the real one.
            </p>
            {shared.map(group => (
              <div key={group.number} className="rounded-lg border border-slate-200 p-3">
                <p className="font-mono text-sm font-semibold text-slate-800">{group.number}</p>
                <ul className="mt-2 space-y-1.5">
                  {group.accounts.map(account => (
                    <li key={account.email} className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-100 bg-slate-50 px-2.5 py-2">
                      <span className="min-w-0 text-xs">
                        <span className="block truncate font-medium text-slate-800">{account.email}</span>
                        <span className="text-slate-500">
                          {account.name || 'no name'} · {account.contracts} contract{account.contracts === 1 ? '' : 's'}
                          {' · joined '}{new Date(account.createdAt).toLocaleDateString('en-IN')}
                          {' · stored as '}<code>{account.stored}</code>
                        </span>
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!!busy}
                        onClick={() => settle(group.number, account.email, group.accounts.length - 1)}
                      >
                        {busy === group.number ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Keep this one'}
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {report && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Put every number in one format</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-slate-600">
              {report.needsRewrite === 0
                ? 'Every number is already stored the same way.'
                : `${report.needsRewrite} number${report.needsRewrite === 1 ? ' is' : 's are'} stored in a form of their own — "9876543210" where another row says "+919876543210". Nobody loses their number; the same number is simply written the same way everywhere.`}
            </p>
            {shared.length > 0 && (
              <p className="flex items-start gap-1.5 rounded border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-800">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" />
                <span>
                  Settle the shared numbers first. Rewriting can CREATE a clash that is not
                  there yet: &quot;+919876543210&quot; and &quot;9876543210&quot; on two
                  accounts look different today and identical afterwards. Those rows are
                  skipped until you have decided who keeps the number.
                </span>
              </p>
            )}
            <Button onClick={normalise} disabled={!!busy || report.needsRewrite === 0}>
              {busy === 'normalise' ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Rewriting…</>
                : `Normalise ${report.safeToRewrite} number${report.safeToRewrite === 1 ? '' : 's'}`}
            </Button>
          </CardContent>
        </Card>
      )}

      {report?.readyForUniqueIndex && report.needsRewrite === 0 && (
        <div className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-emerald-900">Ready for the unique index</p>
            <p className="text-xs text-emerald-700 mt-0.5">
              No number is shared and every one is in the same format. Apply
              <span className="font-medium"> User_phone_unique</span> under System → Pending
              DB changes, and the database will keep it that way from then on.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
