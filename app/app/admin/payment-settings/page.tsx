
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BackButton } from '@/components/ui/back-button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
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

interface PaymentSettings {
  paymentMethod: 'razorpay' | 'manual';
  description?: string;
  updatedAt?: string;
  updatedBy?: string;
}

export default function PaymentSettingsPage() {
  const router = useRouter();
  const [settings, setSettings] = useState<PaymentSettings | null>(null);
  const [selectedMethod, setSelectedMethod] = useState<'razorpay' | 'manual'>('manual');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Which online gateway is live — a separate axis from online-vs-manual above.
  const [gw, setGw] = useState<{ active: 'razorpay' | 'cashfree'; razorpay: { configured: boolean }; cashfree: { configured: boolean; mode: string | null } } | null>(null);
  const [gwChoice, setGwChoice] = useState<'razorpay' | 'cashfree'>('razorpay');
  const [gwSaving, setGwSaving] = useState(false);

  const loadGateway = async () => {
    try {
      const res = await fetch('/api/admin/payment-gateway');
      if (!res.ok) return;
      const data = await res.json();
      setGw(data);
      setGwChoice(data.active);
    } catch { /* leave it */ }
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
    fetchSettings();
    loadGateway();
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await fetch('/api/admin/payment-settings');
      
      if (response.status === 403) {
        toast.error('Access denied - Admin only');
        router.push('/dashboard');
        return;
      }

      if (response.ok) {
        const data = await response.json();
        setSettings(data);
        setSelectedMethod(data.paymentMethod || 'manual');
      } else {
        toast.error('Failed to fetch payment settings');
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
      toast.error('An error occurred while fetching settings');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await fetch('/api/admin/payment-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentMethod: selectedMethod }),
      });

      if (response.ok) {
        const data = await response.json();
        setSettings(data.setting);
        toast.success(`Payment method updated to ${selectedMethod}`);
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to update settings');
      }
    } catch (error) {
      console.error('Error saving settings:', error);
      toast.error('An error occurred while saving settings');
    } finally {
      setSaving(false);
    }
  };

  const hasChanges = settings && settings.paymentMethod !== selectedMethod;

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
            {/* Current Status */}
            <Card className="border-0 shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Info className="h-5 w-5 text-emerald-600" />
                    Current Configuration
                  </span>
                  <Badge variant={settings?.paymentMethod === 'razorpay' ? 'default' : 'secondary'}>
                    {settings?.paymentMethod || 'manual'}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Payment Method:</span>
                    <span className="font-medium capitalize">{settings?.paymentMethod || 'manual'}</span>
                  </div>
                  {settings?.updatedBy && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Last Updated By:</span>
                      <span className="font-medium">{settings.updatedBy}</span>
                    </div>
                  )}
                  {settings?.updatedAt && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Last Updated:</span>
                      <span className="font-medium">
                        {new Date(settings.updatedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
                      </span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Payment Method Selection */}
            <Card className="border-0 shadow-lg">
              <CardHeader>
                <CardTitle>Select Payment Method</CardTitle>
                <CardDescription>
                  Choose how users can top-up their credits
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <RadioGroup value={selectedMethod} onValueChange={(value: any) => setSelectedMethod(value)}>
                  {/* Razorpay Option */}
                  <div className="flex items-start space-x-3 space-y-0 rounded-lg border p-4 hover:bg-gray-50 transition-colors">
                    <RadioGroupItem value="razorpay" id="razorpay" />
                    <div className="flex-1">
                      <Label 
                        htmlFor="razorpay" 
                        className="flex items-center gap-2 font-medium cursor-pointer"
                      >
                        <CreditCard className="h-5 w-5 text-emerald-600" />
                        Razorpay Payment Gateway
                      </Label>
                      <p className="text-sm text-gray-600 mt-1">
                        Enable instant online payments with automatic GST invoice generation.
                        Users can top-up credits using credit/debit cards, UPI, net banking, and wallets.
                      </p>
                      <div className="mt-3 space-y-1">
                        <div className="flex items-center gap-2 text-xs text-green-600">
                          <CheckCircle className="h-3 w-3" />
                          <span>Instant credit top-up</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-green-600">
                          <CheckCircle className="h-3 w-3" />
                          <span>Automatic GST invoice generation</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-green-600">
                          <CheckCircle className="h-3 w-3" />
                          <span>Secure payment processing</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-green-600">
                          <CheckCircle className="h-3 w-3" />
                          <span>Multiple payment methods</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Manual Option */}
                  <div className="flex items-start space-x-3 space-y-0 rounded-lg border p-4 hover:bg-gray-50 transition-colors">
                    <RadioGroupItem value="manual" id="manual" />
                    <div className="flex-1">
                      <Label 
                        htmlFor="manual" 
                        className="flex items-center gap-2 font-medium cursor-pointer"
                      >
                        <Phone className="h-5 w-5 text-green-600" />
                        Manual Credit Top-up
                      </Label>
                      <p className="text-sm text-gray-600 mt-1">
                        Users contact support via phone/email for credit top-up.
                        Credits are added manually by admin after payment confirmation.
                      </p>
                      <div className="mt-3 space-y-1">
                        <div className="flex items-center gap-2 text-xs text-gray-600">
                          <CheckCircle className="h-3 w-3" />
                          <span>Personal support</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-gray-600">
                          <CheckCircle className="h-3 w-3" />
                          <span>Flexible payment options</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-amber-600">
                          <AlertCircle className="h-3 w-3" />
                          <span>Manual processing required</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </RadioGroup>

                {/* Action Buttons */}
                <div className="flex items-center justify-end gap-3 pt-4">
                  <Button
                    variant="outline"
                    onClick={() => setSelectedMethod(settings?.paymentMethod || 'manual')}
                    disabled={!hasChanges || saving}
                  >
                    Reset
                  </Button>
                  <Button
                    onClick={handleSave}
                    disabled={!hasChanges || saving}
                  >
                    {saving ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4 mr-2" />
                        Save Changes
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>

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
