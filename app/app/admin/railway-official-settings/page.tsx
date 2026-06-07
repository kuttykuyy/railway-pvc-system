'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BackButton } from '@/components/ui/back-button';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'react-hot-toast';
import { Info, Save, ShieldCheck } from 'lucide-react';

interface Setting {
  key: string;
  value: string;
  description?: string | null;
  dataType: string;
}

export default function RailwayOfficialSettingsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [monthlyBillLimit, setMonthlyBillLimit] = useState('10');
  const [contractLimit, setContractLimit] = useState('5');

  useEffect(() => {
    fetch('/api/admin/settings')
      .then((r) => {
        if (r.status === 403) { router.push('/dashboard'); return null; }
        return r.json();
      })
      .then((settings: Setting[] | null) => {
        if (!settings) return;
        const billLimit = settings.find((s) => s.key === 'RAILWAY_OFFICIAL_MONTHLY_BILL_LIMIT');
        const ctLimit   = settings.find((s) => s.key === 'RAILWAY_OFFICIAL_CONTRACT_LIMIT');
        if (billLimit) setMonthlyBillLimit(billLimit.value);
        if (ctLimit)   setContractLimit(ctLimit.value);
      })
      .catch(() => toast.error('Failed to load settings'))
      .finally(() => setLoading(false));
  }, [router]);

  const handleSave = async () => {
    const mbl = parseInt(monthlyBillLimit, 10);
    const cl  = parseInt(contractLimit, 10);
    if (isNaN(mbl) || mbl < 0 || isNaN(cl) || cl < 0) {
      toast.error('Values must be 0 or greater (0 = unlimited)');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          settings: [
            { key: 'RAILWAY_OFFICIAL_MONTHLY_BILL_LIMIT', value: String(mbl), dataType: 'number' },
            { key: 'RAILWAY_OFFICIAL_CONTRACT_LIMIT',     value: String(cl),  dataType: 'number' },
          ],
        }),
      });
      if (!res.ok) throw new Error('Failed to save');
      toast.success('Railway Official limits updated');
    } catch {
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[300px] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <BackButton href="/admin/users" className="mb-6" />

      <div className="mb-6 flex items-center gap-3">
        <div className="rounded-xl bg-blue-100 p-2.5">
          <ShieldCheck className="h-6 w-6 text-blue-700" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Railway Official Limits</h1>
          <p className="text-sm text-slate-500">Control free-account quotas for Railway Official users</p>
        </div>
      </div>

      <Card className="rounded-2xl border-slate-200 shadow-sm">
        <CardHeader className="border-b border-slate-100 pb-4">
          <CardTitle className="text-base">Usage limits</CardTitle>
          <CardDescription>
            Set to <strong>0</strong> for unlimited. Changes take effect immediately for new bill/contract creation.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 pt-6">
          {/* Monthly bill limit */}
          <div className="space-y-2">
            <Label htmlFor="monthly-bill-limit" className="text-sm font-semibold text-slate-700">
              Monthly bill limit
            </Label>
            <div className="flex items-center gap-3">
              <Input
                id="monthly-bill-limit"
                type="number"
                min="0"
                value={monthlyBillLimit}
                onChange={(e) => setMonthlyBillLimit(e.target.value)}
                className="w-32 rounded-lg"
              />
              <span className="text-sm text-slate-500">bills per calendar month</span>
            </div>
            <p className="flex items-center gap-1.5 text-xs text-slate-400">
              <Info className="h-3.5 w-3.5" />
              Resets on the 1st of every month. Currently set to <strong>{monthlyBillLimit === '0' ? 'unlimited' : `${monthlyBillLimit} bills/month`}</strong>.
            </p>
          </div>

          {/* Contract limit */}
          <div className="space-y-2">
            <Label htmlFor="contract-limit" className="text-sm font-semibold text-slate-700">
              Total contract limit
            </Label>
            <div className="flex items-center gap-3">
              <Input
                id="contract-limit"
                type="number"
                min="0"
                value={contractLimit}
                onChange={(e) => setContractLimit(e.target.value)}
                className="w-32 rounded-lg"
              />
              <span className="text-sm text-slate-500">contracts total (lifetime)</span>
            </div>
            <p className="flex items-center gap-1.5 text-xs text-slate-400">
              <Info className="h-3.5 w-3.5" />
              Users who hit this limit cannot create new contracts. Currently set to <strong>{contractLimit === '0' ? 'unlimited' : `${contractLimit} contracts`}</strong>.
            </p>
          </div>

          {/* Info box */}
          <div className="rounded-xl bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-800">
            <p className="font-semibold mb-1">Who is affected?</p>
            <p>Only users with the <code className="rounded bg-blue-100 px-1 py-0.5 text-xs">railway_official</code> role are subject to these limits. Admin, superadmin, and regular contractor accounts are not affected.</p>
          </div>
        </CardContent>
      </Card>

      <div className="mt-4 flex justify-end gap-3">
        <Button variant="outline" onClick={() => router.back()}>Cancel</Button>
        <Button onClick={handleSave} disabled={saving}>
          <Save className="mr-2 h-4 w-4" />
          {saving ? 'Saving…' : 'Save limits'}
        </Button>
      </div>
    </div>
  );
}
