
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BackButton } from '@/components/ui/back-button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  CreditCard,
  Phone,
  Loader2,
  CheckCircle,
  AlertCircle,
  Settings,
  Save,
  Info
} from 'lucide-react';
import { toast } from 'sonner';

export default function PaymentSettingsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  // Which online gateway is live — a separate axis from online-vs-manual above.
  const [gw, setGw] = useState<{ active: 'razorpay' | 'cashfree'; razorpay: { configured: boolean }; cashfree: { configured: boolean; mode: string | null } } | null>(null);
  const [gwChoice, setGwChoice] = useState<'razorpay' | 'cashfree'>('razorpay');
  const [gwSaving, setGwSaving] = useState(false);

  const loadGateway = async () => {
    try {
      const res = await fetch('/api/admin/payment-gateway');
      if (res.status === 403) { toast.error('Access denied - Admin only'); router.push('/dashboard'); return; }
      if (!res.ok) return;
      const data = await res.json();
      setGw(data);
      setGwChoice(data.active);
    } catch { /* leave it */ } finally { setLoading(false); }
  };

  const saveGateway = async () => {
    setGwSaving(true);
    try {
      const res = await fetch('/api/admin/payment-gateway', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gateway: gwChoice }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not switch gateway');
      toast.success(`New top-ups now go through ${gwChoice}.`);
      loadGateway();
    } catch (e: any) {
      toast.error(e.message, { duration: 8000 });
    } finally {
      setGwSaving(false);
    }
  };

  useEffect(() => {
    loadGateway();
  }, []);


  return (
    <div className="container mx-auto px-4 py-6 max-w-4xl">
      <div className="space-y-6">
        {/* /admin/settings never existed — this was a 404. The screen lives in the
            Money & Billing hub now, so that is "back". */}
        <BackButton href="/admin/money" label="Money & Billing" className="mb-4" />
        
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold text-gray-900 flex items-center justify-center gap-3">
            <Settings className="h-8 w-8 text-emerald-600" />
            Payment Settings
          </h1>
          <p className="text-gray-600">
            Configure payment method for credit top-ups
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
            <span className="ml-3 text-gray-600">Loading settings...</span>
          </div>
        ) : (
          <>

            {/* Which online gateway takes the money */}
            {gw && (
              <Card className="border-0 shadow-lg">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CreditCard className="h-5 w-5 text-emerald-600" /> Online payment gateway
                  </CardTitle>
                  <CardDescription>
                    Which provider processes card / UPI top-ups. Only one is live at a time.
                    Switching takes effect on the next payment — no deploy.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {(['razorpay', 'cashfree'] as const).map(name => {
                    const configured = name === 'razorpay' ? gw.razorpay.configured : gw.cashfree.configured;
                    return (
                      <label key={name} className={`flex items-center justify-between rounded-lg border p-3 ${
                        configured ? 'cursor-pointer hover:bg-slate-50' : 'opacity-60'} ${
                        gwChoice === name ? 'border-emerald-400 bg-emerald-50/50' : 'border-slate-200'}`}>
                        <span className="flex items-center gap-3">
                          <input type="radio" name="gw" checked={gwChoice === name} disabled={!configured}
                            onChange={() => setGwChoice(name)} />
                          <span>
                            <span className="font-medium capitalize">{name}</span>
                            {name === 'cashfree' && gw.cashfree.mode && (
                              <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">{gw.cashfree.mode}</span>
                            )}
                            {gw.active === name && <span className="ml-2 text-[11px] font-semibold text-emerald-700">live now</span>}
                          </span>
                        </span>
                        {!configured && <span className="text-[11px] text-slate-400">no credentials set</span>}
                      </label>
                    );
                  })}
                  <Button onClick={saveGateway} disabled={gwSaving || gwChoice === gw.active} className="w-full sm:w-auto">
                    {gwSaving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Switching…</> : `Make ${gwChoice} live`}
                  </Button>
                  {gw.cashfree.mode === 'sandbox' && gwChoice === 'cashfree' && (
                    <p className="text-[11px] text-amber-700">Cashfree is in sandbox mode — no real money moves. Set CASHFREE_MODE to production when ready.</p>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Important Notes */}
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-sm">
                <strong>Important Notes:</strong>
                <ul className="list-disc list-inside mt-2 space-y-1">
                  <li>Razorpay requires valid API credentials to be configured</li>
                  <li>GST invoices are automatically generated for Razorpay payments</li>
                  <li>Manual top-up allows flexibility but requires admin intervention</li>
                  <li>Changes take effect immediately for all users</li>
                </ul>
              </AlertDescription>
            </Alert>
          </>
        )}
      </div>
    </div>
  );
}
