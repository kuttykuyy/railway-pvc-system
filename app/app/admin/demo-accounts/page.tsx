'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Users, AlertTriangle, Copy, Trash2, RefreshCw } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { getRailwayZoneOptions } from '@/lib/zone-steel-city-mapping';

interface DemoAccount {
  email: string;
  name: string;
  role: string;
  what: string;
  exists?: boolean;
  railwayZone?: string | null;
}

interface CreatedAccount {
  email: string;
  password: string;
  role: string;
  name: string;
  isNew: boolean;
}

/**
 * Creates the two department demo accounts — one executive, one accounts/audit — so the
 * approval chain can be walked end to end. Passwords are shown once and never stored in
 * readable form; creating again resets them.
 */
export default function DemoAccountsPage() {
  const [zone, setZone] = useState('SR');
  const [accounts, setAccounts] = useState<DemoAccount[]>([]);
  const [created, setCreated] = useState<CreatedAccount[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const check = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/demo-accounts');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Check failed');
      setAccounts(data.accounts || []);
      const withZone = (data.accounts || []).find((a: DemoAccount) => a.railwayZone);
      if (withZone?.railwayZone) setZone(withZone.railwayZone);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { check(); }, [check]);

  const create = async () => {
    setBusy(true);
    setCreated(null);
    try {
      const res = await fetch('/api/admin/demo-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ railwayZone: zone }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setCreated(data.accounts);
      toast.success('Demo accounts ready — copy the passwords now.');
      await check();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/admin/demo-accounts', { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setCreated(null);
      toast.success(data.message || `Removed ${data.deleted} demo account(s).`, { duration: 6000 });
      await check();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied');
  };

  const anyExists = accounts.some((a) => a.exists);

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <div className="flex items-center gap-2">
        <Users className="h-5 w-5 text-slate-600" />
        <h1 className="text-xl font-semibold">Demo department accounts</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">One executive, one accounts / audit</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-slate-600 leading-relaxed">
            Creates two fixed accounts so the approval chain can be walked end to end without an
            official railway email address. Both are scoped to the zone below — they see that
            division&apos;s bills and no others.
          </p>

          <ul className="text-xs space-y-2">
            {accounts.map((a) => (
              <li key={a.email} className="flex items-start gap-2">
                <span className={`mt-1.5 h-1.5 w-1.5 rounded-full shrink-0 ${a.exists ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                <span className="text-slate-600">
                  <code className="font-medium">{a.email}</code>
                  {a.exists ? <span className="text-emerald-700"> — exists{a.railwayZone ? `, zone ${a.railwayZone}` : ''}</span> : ' — not created'}
                  <span className="block text-slate-400">{a.what}</span>
                </span>
              </li>
            ))}
          </ul>

          <div className="space-y-2">
            <Label htmlFor="zone">Railway Zone</Label>
            <Select value={zone} onValueChange={setZone}>
              <SelectTrigger id="zone" className="w-[280px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {getRailwayZoneOptions().map((z) => (
                  <SelectItem key={z.value} value={z.value}>{z.label} ({z.value})</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-slate-500">
              Use the zone of the bills you want to test with, or neither account will see them.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={create} disabled={busy || loading}>
              {busy ? 'Working…' : anyExists ? 'Recreate & reset passwords' : 'Create demo accounts'}
            </Button>
            <Button variant="outline" onClick={check} disabled={busy || loading}>
              <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} /> Re-check
            </Button>
            {anyExists && (
              <Button variant="outline" onClick={remove} disabled={busy}
                className="text-red-600 border-red-200 hover:bg-red-50 ml-auto">
                <Trash2 className="h-4 w-4 mr-1.5" /> Remove them
              </Button>
            )}
          </div>

          {created && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-4 space-y-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-900">
                  <b>Copy these now.</b> The passwords are shown once and are not stored anywhere in
                  readable form. Press the button again to reset them.
                </p>
              </div>
              {created.map((a) => (
                <div key={a.email} className="rounded border border-amber-200 bg-white p-3 text-xs space-y-1">
                  <p className="font-semibold text-slate-800">{a.name}</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 truncate">{a.email}</code>
                    <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => copy(a.email)}>
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 truncate font-bold">{a.password}</code>
                    <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => copy(a.password)}>
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <p className="text-xs text-slate-400">
            Remove them once the demo is done — both can read and act on real bills in their zone.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
