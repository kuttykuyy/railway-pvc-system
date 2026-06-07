'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { BackButton } from '@/components/ui/back-button';
import { toast } from 'react-hot-toast';
import {
  User, Loader2, History, CreditCard, IndianRupee, FileText,
  CheckCircle, Plus, Minus, Calendar, Activity, Download, Eye,
  Receipt, Phone, Clock, FolderOpen,
} from 'lucide-react';
import { getClientRoleInfo } from '@/lib/role-auth';
import { format } from 'date-fns';
import { toISTDate } from '@/lib/ist-utils';
import { RailwayPostingForm } from '@/components/railway-posting-form';
import { RazorpayTopupDialog } from '@/components/ui/razorpay-topup-dialog';

/* ── Types ──────────────────────────────────────────────────────────── */
interface CreditBalance {
  balance: number;
  nextBillCost: number;
  canAffordNextBill: boolean;
  showLowCreditWarning: boolean;
  paymentProcessingEnabled: boolean;
  isPaidUser: boolean;
  trialInfo: { isActive: boolean; billsUsed: number; billsRemaining: number; billsTotal: number };
  subscription?: { isActive: boolean; expiryDate: string | null };
  accountInfo: { tier: string; monthlyBillCount: number; status: string };
}
interface BillingSettings {
  billCost: number; freeTrialBills: number; freeTrialUsed: number;
  freeTrialRemaining: number; isTrialActive: boolean; isFreeAccount: boolean;
  customProcessingFee: number | null;
}
interface CreditTransaction {
  id: string; amount: number; type: string; reason: string;
  balanceBefore: number; balanceAfter: number; createdAt: string;
  adminUserEmail?: string; billId?: string;
}
interface GstInvoice {
  id: string; invoiceNumber: string; invoiceDate: string;
  customerName: string; customerEmail: string;
  subtotal: number; cgst: number; sgst: number; igst: number;
  totalGst: number; totalAmount: number; description: string;
  isInterstate: boolean; razorpayTransactionId: string;
}

export default function ProfilePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { isAdmin } = getClientRoleInfo(session);

  /* profile state */
  const [loading, setLoading] = useState(true);
  const [userData, setUserData] = useState<any>(null);
  const [auditSettings, setAuditSettings] = useState<any[]>([]);
  const [roQuota, setRoQuota] = useState<{ contracts: { allowed: boolean; used: number; limit: number; remaining: number } } | null>(null);
  const [quotaRequesting, setQuotaRequesting] = useState(false);
  const [quotaRequestSent, setQuotaRequestSent] = useState(false);

  const requestQuotaIncrease = async () => {
    setQuotaRequesting(true);
    try {
      const r = await fetch('/api/user/request-quota-increase', { method: 'POST' });
      const d = await r.json();
      if (r.ok) setQuotaRequestSent(true);
      else toast.error(d.error || 'Failed to send. Please call admin directly.');
    } catch {
      toast.error('Failed to send. Please call admin directly.');
    } finally {
      setQuotaRequesting(false);
    }
  };

  /* billing state */
  const [billingSettings, setBillingSettings] = useState<BillingSettings | null>(null);
  const [creditBalance, setCreditBalance] = useState<CreditBalance | null>(null);
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [gstInvoices, setGstInvoices] = useState<GstInvoice[]>([]);
  const [billingLoading, setBillingLoading] = useState(true);
  const [transactionsLoading, setTransactionsLoading] = useState(true);
  const [invoicesLoading, setInvoicesLoading] = useState(true);
  const [razorpayDialogOpen, setRazorpayDialogOpen] = useState(false);
  const [razorpayEnabled, setRazorpayEnabled] = useState(false);
  const [activeTab, setActiveTab] = useState<'transactions' | 'invoices'>('transactions');
  const [subscribing, setSubscribing] = useState(false);
  const [subscriptionMessage, setSubscriptionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  /* ── Auth redirect ─────────────────────────────────────────────────── */
  useEffect(() => {
    if (status === 'unauthenticated') router.push('/auth/signin');
    else if (status === 'authenticated') {
      fetchUserData();
      if (isAdmin) {
        fetch('/api/admin/settings')
          .then(r => r.json())
          .then(d => setAuditSettings(Array.isArray(d) ? d : []))
          .catch(() => {});
      }
    }
  }, [status, router, isAdmin]);

  /* ── Billing data fetches ──────────────────────────────────────────── */
  useEffect(() => {
    Promise.all([fetch('/api/billing/settings'), fetch('/api/credits/balance')])
      .then(async ([sRes, bRes]) => {
        if (sRes.ok) setBillingSettings(await sRes.json());
        if (bRes.ok) setCreditBalance(await bRes.json());
      })
      .catch(console.error)
      .finally(() => setBillingLoading(false));

    fetch('/api/credits/transactions')
      .then(r => r.ok ? r.json() : { transactions: [] })
      .then(d => setTransactions(d.transactions || []))
      .catch(console.error)
      .finally(() => setTransactionsLoading(false));

    fetch('/api/razorpay/config')
      .then(r => r.ok ? r.json() : {})
      .then(d => setRazorpayEnabled(!!d.enabled))
      .catch(console.error);

    fetch('/api/gst-invoices')
      .then(r => r.ok ? r.json() : { invoices: [] })
      .then(d => setGstInvoices(d.invoices || []))
      .catch(console.error)
      .finally(() => setInvoicesLoading(false));
  }, []);

  /* ── Handlers ──────────────────────────────────────────────────────── */
  const fetchUserData = async () => {
    try {
      const r = await fetch('/api/auth/profile');
      if (!r.ok) throw new Error();
      const data = await r.json();
      setUserData(data);
      // Fetch quota for railway officials
      if (data.role === 'railway_official') {
        fetch('/api/user/quota')
          .then(r => r.ok ? r.json() : null)
          .then(q => { if (q?.applicable) setRoQuota(q); })
          .catch(() => {});
      }
    } catch {
      toast.error('Failed to load user data');
    } finally {
      setLoading(false);
    }
  };

  const refreshBilling = async () => {
    const [bRes, tRes, iRes] = await Promise.all([
      fetch('/api/credits/balance'),
      fetch('/api/credits/transactions'),
      fetch('/api/gst-invoices'),
    ]);
    if (bRes.ok) setCreditBalance(await bRes.json());
    if (tRes.ok) setTransactions((await tRes.json()).transactions || []);
    if (iRes.ok) setGstInvoices((await iRes.json()).invoices || []);
  };

  const handleSubscribeTools = async () => {
    if (subscribing) return;
    setSubscribing(true);
    setSubscriptionMessage(null);
    try {
      const r = await fetch('/api/billing/subscribe-tools', { method: 'POST' });
      const d = await r.json();
      if (r.ok) {
        setSubscriptionMessage({ type: 'success', text: d.message });
        await refreshBilling();
      } else {
        setSubscriptionMessage({ type: 'error', text: d.error || 'Failed to activate subscription.' });
      }
    } catch {
      setSubscriptionMessage({ type: 'error', text: 'An unexpected error occurred.' });
    } finally {
      setSubscribing(false);
    }
  };

  /* ── Helpers ───────────────────────────────────────────────────────── */
  const effectiveBillCost = billingSettings?.isFreeAccount
    ? 0
    : billingSettings?.customProcessingFee ?? billingSettings?.billCost ?? 199;

  const fmtDate = (ds: string) =>
    new Date(ds).toLocaleDateString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });

  const txnIcon = (type: string) => {
    if (type === 'add') return <Plus className="h-4 w-4 text-green-600" />;
    if (type === 'deduct' || type === 'bill_usage') return <Minus className="h-4 w-4 text-red-600" />;
    if (type === 'refund') return <CheckCircle className="h-4 w-4 text-blue-600" />;
    return <Activity className="h-4 w-4 text-slate-600" />;
  };
  const txnColor = (type: string) => {
    if (type === 'add') return 'text-green-600 font-semibold';
    if (type === 'deduct' || type === 'bill_usage') return 'text-red-600 font-semibold';
    if (type === 'refund') return 'text-blue-600 font-semibold';
    return 'text-slate-600';
  };

  /* ── Loading screen ────────────────────────────────────────────────── */
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-10 w-10 animate-spin text-purple-600" />
      </div>
    );
  }

  /* ── Render ────────────────────────────────────────────────────────── */
  return (
    <div className="container mx-auto py-8 px-4 max-w-5xl">
      {/* Header */}
      <div className="mb-6">
        <BackButton href="/dashboard" className="mb-4" />
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <User className="h-6 w-6 text-purple-600" />
          Profile & Billing
        </h1>
        <p className="text-slate-500 mt-1 text-sm">
          Your account details, posting information, and credit management in one place.
        </p>
      </div>

      <div className="space-y-6">

        {/* ── 1. Account Information ──────────────────────────────────── */}
        <Card className="border border-slate-100 shadow-sm bg-white rounded-2xl overflow-hidden">
          <CardHeader className="bg-slate-50/50 border-b border-slate-100 px-5 py-4">
            <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <User className="h-4 w-4 text-purple-600" />
              Account Information
            </CardTitle>
          </CardHeader>
          <CardContent className="p-5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Full Name', value: userData?.name || 'Not provided' },
                { label: 'Email Address', value: userData?.email, cls: 'break-all' },
                { label: 'Account Role', value: userData?.role?.replace('_', ' ') || 'user', cls: 'capitalize' },
                { label: 'Member Since', value: userData?.createdAt ? format(toISTDate(new Date(userData.createdAt)), 'MMM dd, yyyy') : 'N/A' },
              ].map(({ label, value, cls }) => (
                <div key={label} className="p-3.5 bg-slate-50 border border-slate-100 rounded-xl">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">{label}</span>
                  <span className={`font-semibold text-slate-800 text-sm ${cls || ''}`}>{value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* ── 2. Railway Posting Details + Contract Quota (railway_official only) ── */}
        {userData?.role === 'railway_official' && (
          <>
            <div id="posting">
              <RailwayPostingForm userData={userData} onUpdate={fetchUserData} />
            </div>

            {/* Contract cap details */}
            {roQuota && (
              <Card className={`border shadow-sm rounded-2xl overflow-hidden ${
                !roQuota.contracts.allowed
                  ? 'border-red-200 bg-red-50/50'
                  : roQuota.contracts.limit > 0 && roQuota.contracts.remaining <= 1
                  ? 'border-amber-200 bg-amber-50/50'
                  : 'border-slate-100 bg-white'
              }`}>
                <CardHeader className="border-b border-inherit px-5 py-4">
                  <CardTitle className="text-sm font-bold flex items-center justify-between">
                    <span className="flex items-center gap-2 text-slate-900">
                      <FolderOpen className="h-4 w-4 text-purple-600" />
                      Contract Quota
                    </span>
                    {!roQuota.contracts.allowed ? (
                      <Badge className="bg-red-100 text-red-700 border border-red-200 text-[10px]">Limit Reached</Badge>
                    ) : roQuota.contracts.limit > 0 && roQuota.contracts.remaining <= 1 ? (
                      <Badge className="bg-amber-100 text-amber-700 border border-amber-200 text-[10px]">Almost Full</Badge>
                    ) : (
                      <Badge className="bg-green-100 text-green-700 border border-green-200 text-[10px]">Active</Badge>
                    )}
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500 mt-0.5">
                    Free Railway Official accounts are capped on total contracts
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-5 space-y-4">
                  {/* Usage bar row */}
                  <div className="flex items-center gap-5">
                    <div className="shrink-0 text-center">
                      <p className={`text-4xl font-black ${!roQuota.contracts.allowed ? 'text-red-600' : roQuota.contracts.remaining <= 1 ? 'text-amber-600' : 'text-purple-600'}`}>
                        {roQuota.contracts.used}
                        {roQuota.contracts.limit > 0 && <span className="text-xl font-medium text-slate-400">/{roQuota.contracts.limit}</span>}
                      </p>
                      <p className="text-[10px] text-slate-400 uppercase tracking-wide mt-0.5">used</p>
                    </div>
                    <div className="flex-1 space-y-2">
                      {roQuota.contracts.limit > 0 && (
                        <div className="w-full bg-slate-100 rounded-full h-2.5">
                          <div
                            className={`h-2.5 rounded-full transition-all ${!roQuota.contracts.allowed ? 'bg-red-500' : roQuota.contracts.remaining <= 1 ? 'bg-amber-500' : 'bg-purple-500'}`}
                            style={{ width: `${Math.min(100, (roQuota.contracts.used / roQuota.contracts.limit) * 100)}%` }}
                          />
                        </div>
                      )}
                      <p className="text-xs text-slate-500">
                        {roQuota.contracts.limit === 0
                          ? '✓ Unlimited — no cap on your account'
                          : roQuota.contracts.remaining > 0
                          ? `${roQuota.contracts.remaining} slot${roQuota.contracts.remaining !== 1 ? 's' : ''} remaining`
                          : 'All slots used'}
                      </p>
                    </div>
                  </div>

                  {/* CTA when at or near limit */}
                  {roQuota.contracts.limit > 0 && (!roQuota.contracts.allowed || roQuota.contracts.remaining <= 1) && (
                    <div className={`rounded-xl border p-4 space-y-3 ${!roQuota.contracts.allowed ? 'border-red-200 bg-red-50' : 'border-amber-200 bg-amber-50'}`}>
                      <div>
                        <p className={`text-sm font-bold ${!roQuota.contracts.allowed ? 'text-red-800' : 'text-amber-800'}`}>
                          {!roQuota.contracts.allowed ? '🚫 Contract limit reached' : '⚠️ Almost at your limit'}
                        </p>
                        <p className={`text-xs mt-0.5 ${!roQuota.contracts.allowed ? 'text-red-600' : 'text-amber-700'}`}>
                          {!roQuota.contracts.allowed
                            ? 'You cannot create new contracts. Message the admin on WhatsApp to request an increase.'
                            : 'You have 1 contract slot left. Contact admin in advance to avoid disruption.'}
                        </p>
                      </div>
                      <div className="flex flex-col sm:flex-row gap-2">
                        {quotaRequestSent ? (
                          <div className="flex items-center gap-2 text-green-700 text-xs font-semibold bg-green-50 border border-green-200 rounded-xl px-4 py-2.5">
                            ✓ Request sent to admin via WhatsApp. They will contact you shortly.
                          </div>
                        ) : (
                          <button
                            onClick={requestQuotaIncrease}
                            disabled={quotaRequesting}
                            className="inline-flex items-center justify-center gap-2 rounded-xl bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white text-xs font-bold px-4 py-2.5 transition-colors"
                          >
                            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                            {quotaRequesting ? 'Sending…' : 'Request Limit Increase via WhatsApp'}
                          </button>
                        )}
                        <a
                          href="tel:+919944776689"
                          className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold px-4 py-2.5 transition-colors"
                        >
                          <Phone className="h-3.5 w-3.5" />
                          Call +91 99447 76689
                        </a>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </>
        )}

        {/* ── 3. Credit & Billing ────────────────────────────────────── */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <CreditCard className="h-5 w-5 text-purple-600" />
            <h2 className="text-base font-bold text-slate-900">Credit & Billing</h2>
          </div>

          {billingLoading ? (
            <div className="flex items-center justify-center py-12 bg-white border border-slate-100 rounded-2xl">
              <Loader2 className="h-6 w-6 animate-spin text-purple-600" />
              <span className="ml-3 text-slate-500 text-sm">Loading billing info…</span>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Balance + Top-up + Config + Tools — 2×2 grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

                {/* Current Balance / Free Plan */}
                <Card className="border border-slate-100 shadow-sm bg-white rounded-2xl overflow-hidden">
                  <CardHeader className="bg-slate-50/50 border-b border-slate-100 px-4 py-3">
                    <CardTitle className="text-xs font-bold text-slate-900 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <CreditCard className="h-4 w-4 text-purple-600" />
                        {effectiveBillCost === 0 ? 'Plan' : 'Balance'}
                      </span>
                      {creditBalance && (
                        <Badge variant="secondary" className="bg-purple-50 text-purple-700 border border-purple-100 text-[9px] rounded-md font-semibold px-1.5 py-0.5">
                          {creditBalance.accountInfo.tier}
                        </Badge>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4">
                    {effectiveBillCost === 0 ? (
                      <div className="space-y-2">
                        <div className="p-3 bg-gradient-to-br from-purple-50 to-indigo-50/50 border border-purple-100 rounded-xl">
                          <span className="text-[10px] font-bold text-purple-500 uppercase tracking-wider block mb-0.5">Active Plan</span>
                          <span className="text-base font-black text-purple-700">Unlimited Free</span>
                          <p className="text-[10px] text-purple-600/80 mt-1 leading-relaxed">All PVC bills processed at zero cost.</p>
                        </div>
                        <div className="text-[11px] text-slate-500 space-y-1">
                          <div className="flex justify-between"><span>Next Bill:</span><span className="font-semibold text-green-600">Free (₹0)</span></div>
                          <div className="flex justify-between"><span>Bills Generated:</span><span className="font-semibold text-slate-700">{creditBalance?.accountInfo.monthlyBillCount || 0}</span></div>
                        </div>
                      </div>
                    ) : creditBalance?.trialInfo.isActive ? (
                      <div className="space-y-1.5">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Trial Bills Left</span>
                        <span className="text-3xl font-bold text-green-600">{creditBalance.trialInfo.billsRemaining}</span>
                        <p className="text-[11px] text-slate-500">{creditBalance.trialInfo.billsUsed} of {creditBalance.trialInfo.billsTotal} used</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Available Credits</span>
                        <div className="text-2xl font-bold text-slate-900">₹{creditBalance?.balance.toFixed(2) || '0.00'}</div>
                        <div className="text-[11px] text-slate-500 space-y-1 pt-1.5 border-t border-slate-100">
                          <div className="flex justify-between"><span>Next Bill:</span><span className="font-semibold text-slate-700">₹{creditBalance?.nextBillCost || effectiveBillCost}</span></div>
                          <div className="flex justify-between"><span>Bills This Month:</span><span className="font-semibold text-slate-700">{creditBalance?.accountInfo.monthlyBillCount || 0}</span></div>
                        </div>
                      </div>
                    )}
                    <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-1.5">
                      <div className={`w-2 h-2 rounded-full ${effectiveBillCost === 0 || creditBalance?.canAffordNextBill || (creditBalance?.trialInfo.billsRemaining || 0) > 0 ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
                      <span className="text-[11px] text-slate-600 font-medium">
                        {effectiveBillCost === 0 || creditBalance?.canAffordNextBill || (creditBalance?.trialInfo.billsRemaining || 0) > 0 ? 'Ready' : 'Insufficient Credits'}
                      </span>
                    </div>
                  </CardContent>
                </Card>

                {/* Top-up (paid only) */}
                {effectiveBillCost > 0 && (
                  <Card className="border border-slate-100 shadow-sm bg-white rounded-2xl overflow-hidden">
                    <CardHeader className="bg-slate-50/50 border-b border-slate-100 px-4 py-3">
                      <CardTitle className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                        <IndianRupee className="h-4 w-4 text-purple-600" />
                        Top-Up Credits
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 space-y-3">
                      {razorpayEnabled && (
                        <Button
                          onClick={() => setRazorpayDialogOpen(true)}
                          className="w-full bg-purple-600 hover:bg-purple-700 text-white rounded-xl h-9 text-xs font-bold"
                        >
                          <CreditCard className="h-3.5 w-3.5 mr-1.5" />
                          Pay via Razorpay
                        </Button>
                      )}
                      <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl space-y-1.5">
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Manual Contact</div>
                        <div className="flex items-center gap-1.5 text-slate-800 text-xs font-semibold">
                          <User className="h-3.5 w-3.5 text-purple-500" />
                          Prasath Kumar (Admin)
                        </div>
                        <div className="flex items-center gap-1.5 text-xs">
                          <Phone className="h-3.5 w-3.5 text-purple-500" />
                          <a href="tel:+919944776689" className="text-purple-600 font-bold hover:underline">+91 9944776689</a>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Billing Config */}
                <Card className="border border-slate-100 shadow-sm bg-white rounded-2xl overflow-hidden">
                  <CardHeader className="bg-slate-50/50 border-b border-slate-100 px-4 py-3">
                    <CardTitle className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      <FileText className="h-4 w-4 text-purple-600" />
                      Billing Config
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4">
                    {effectiveBillCost === 0 ? (
                      <div className="space-y-2">
                        <div className="p-2.5 bg-slate-50 border border-slate-100 rounded-xl flex justify-between items-center">
                          <span className="text-[10px] font-bold text-slate-400 uppercase">Cost / Bill</span>
                          <span className="text-sm font-bold text-green-600">Free (₹0)</span>
                        </div>
                        <p className="text-[11px] text-slate-500 leading-relaxed">Exempt from credit deductions. Unlimited bill generation.</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="p-2.5 bg-slate-50 border border-slate-100 rounded-xl flex justify-between items-center">
                          <span className="text-[10px] font-bold text-slate-400 uppercase">Cost / Bill</span>
                          <span className="text-xl font-bold text-purple-600">₹{effectiveBillCost.toLocaleString()}</span>
                        </div>
                        {billingSettings?.isTrialActive && (
                          <div className="flex justify-between text-[11px]">
                            <span className="text-slate-500">Trial remaining:</span>
                            <span className="font-semibold text-slate-700">{billingSettings.freeTrialRemaining} / {billingSettings.freeTrialBills} bills</span>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Advanced Tools Add-on */}
                <Card className="border border-slate-100 shadow-sm bg-gradient-to-br from-white to-indigo-50/20 rounded-2xl overflow-hidden">
                  <CardHeader className="bg-gradient-to-r from-indigo-50/30 to-purple-50/30 border-b border-slate-100 px-4 py-3">
                    <CardTitle className="text-xs font-bold text-slate-900 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <Activity className="h-4 w-4 text-indigo-600" />
                        Advanced Tools
                      </span>
                      {effectiveBillCost === 0 ? (
                        <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-100 text-[9px] rounded-md font-semibold px-1.5 py-0.5">Exempt</Badge>
                      ) : creditBalance?.subscription?.isActive ? (
                        <Badge className="bg-green-50 text-green-700 border border-green-100 text-[9px] rounded-md font-semibold px-1.5 py-0.5 animate-pulse">Active</Badge>
                      ) : (
                        <Badge className="bg-amber-50 text-amber-700 border border-amber-100 text-[9px] rounded-md font-semibold px-1.5 py-0.5">Inactive</Badge>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 space-y-3">
                    <ul className="text-[11px] text-slate-600 space-y-1">
                      <li className="flex items-center gap-1.5"><span className="text-indigo-600 font-bold">✓</span> PVC Check Tool</li>
                      <li className="flex items-center gap-1.5"><span className="text-indigo-600 font-bold">✓</span> Class Analyzer</li>
                    </ul>
                    {effectiveBillCost === 0 ? (
                      <p className="text-[11px] text-slate-500">Full access included in your free plan.</p>
                    ) : creditBalance?.subscription?.isActive ? (
                      <p className="text-[11px] text-slate-700 font-medium flex items-center gap-1">
                        <Calendar className="h-3 w-3 text-indigo-500" />
                        Expires: {creditBalance.subscription.expiryDate ? fmtDate(creditBalance.subscription.expiryDate) : 'N/A'}
                      </p>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex justify-between text-[11px]">
                          <span className="text-slate-500">Price:</span>
                          <span className="font-black text-indigo-600">₹99 / month</span>
                        </div>
                        <Button
                          onClick={handleSubscribeTools}
                          disabled={subscribing || (creditBalance?.balance || 0) < 99}
                          className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-xl h-8 text-xs font-bold"
                        >
                          {subscribing ? <><Loader2 className="h-3 w-3 animate-spin mr-1" />Activating…</> : 'Subscribe (₹99)'}
                        </Button>
                        {(creditBalance?.balance || 0) < 99 && (
                          <p className="text-[10px] text-red-500 text-center">Top up wallet first.</p>
                        )}
                      </div>
                    )}
                    {subscriptionMessage && (
                      <p className={`text-[11px] font-bold text-center ${subscriptionMessage.type === 'success' ? 'text-green-600' : 'text-red-500'}`}>
                        {subscriptionMessage.text}
                      </p>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Transactions / GST Invoices */}
              {(effectiveBillCost > 0 || transactions.length > 0) && (
                <Card className="border border-slate-100 shadow-sm bg-white rounded-2xl overflow-hidden">
                  <CardHeader className="bg-slate-50/50 border-b border-slate-100 px-5 py-4">
                    <CardTitle className="flex items-center justify-between">
                      <span className="text-sm font-bold text-slate-900 flex items-center gap-2">
                        <Activity className="h-4 w-4 text-purple-600" />
                        {activeTab === 'transactions' ? 'Credit Transactions' : 'GST Invoices'}
                      </span>
                      {effectiveBillCost > 0 && (
                        <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
                          {(['transactions', 'invoices'] as const).map(tab => (
                            <Button
                              key={tab}
                              variant="ghost"
                              size="sm"
                              onClick={() => setActiveTab(tab)}
                              className={`text-xs h-7 px-3 rounded-lg ${activeTab === tab ? 'bg-white text-slate-900 shadow-sm hover:bg-white' : 'text-slate-500 hover:text-slate-800'}`}
                            >
                              {tab === 'transactions' ? <><Activity className="h-3 w-3 mr-1" />Transactions</> : <><Receipt className="h-3 w-3 mr-1" />GST Invoices</>}
                            </Button>
                          ))}
                        </div>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    {activeTab === 'transactions' || effectiveBillCost === 0 ? (
                      transactionsLoading ? (
                        <div className="flex items-center justify-center py-10">
                          <Loader2 className="h-5 w-5 animate-spin text-purple-600" />
                          <span className="ml-2 text-slate-500 text-xs">Loading…</span>
                        </div>
                      ) : transactions.length === 0 ? (
                        <div className="text-center py-10">
                          <Clock className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                          <p className="text-sm font-bold text-slate-600">No Transactions Yet</p>
                          <p className="text-xs text-slate-400 mt-1">Credit changes will appear here.</p>
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-slate-100 bg-slate-50/50 text-slate-500 text-xs font-bold uppercase tracking-wider">
                                <th className="text-left py-3 px-5">Date</th>
                                <th className="text-left py-3 px-5">Type</th>
                                <th className="text-left py-3 px-5">Description</th>
                                <th className="text-right py-3 px-5">Amount</th>
                                <th className="text-right py-3 px-5">Balance</th>
                              </tr>
                            </thead>
                            <tbody>
                              {transactions.map(txn => (
                                <tr key={txn.id} className="border-b border-slate-50 hover:bg-slate-50/30 transition-colors">
                                  <td className="py-3 px-5 text-xs text-slate-500">
                                    <div className="flex items-center gap-1.5"><Calendar className="h-3 w-3 text-slate-400" />{fmtDate(txn.createdAt)}</div>
                                  </td>
                                  <td className="py-3 px-5">
                                    <div className="flex items-center gap-1.5">{txnIcon(txn.type)}<span className="text-xs font-medium capitalize text-slate-700">{txn.type.replace('_', ' ')}</span></div>
                                  </td>
                                  <td className="py-3 px-5 text-slate-700 text-xs">
                                    {txn.reason}
                                    {txn.adminUserEmail && <div className="text-[10px] text-slate-400 mt-0.5">By: {txn.adminUserEmail}</div>}
                                  </td>
                                  <td className={`py-3 px-5 text-right text-xs ${txnColor(txn.type)}`}>{txn.amount >= 0 ? '+' : ''}₹{txn.amount.toFixed(2)}</td>
                                  <td className="py-3 px-5 text-right text-xs font-bold text-slate-800">₹{txn.balanceAfter.toFixed(2)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )
                    ) : (
                      invoicesLoading ? (
                        <div className="flex items-center justify-center py-10">
                          <Loader2 className="h-5 w-5 animate-spin text-purple-600" />
                          <span className="ml-2 text-slate-500 text-xs">Loading…</span>
                        </div>
                      ) : gstInvoices.length === 0 ? (
                        <div className="text-center py-10">
                          <Receipt className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                          <p className="text-sm font-bold text-slate-600">No GST Invoices</p>
                          <p className="text-xs text-slate-400 mt-1">Generated on successful top-ups.</p>
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-slate-100 bg-slate-50/50 text-slate-500 text-xs font-bold uppercase tracking-wider">
                                <th className="text-left py-3 px-5">Invoice No.</th>
                                <th className="text-left py-3 px-5">Date</th>
                                <th className="text-left py-3 px-5">Description</th>
                                <th className="text-right py-3 px-5">Subtotal</th>
                                <th className="text-right py-3 px-5">GST</th>
                                <th className="text-right py-3 px-5">Total</th>
                                <th className="text-center py-3 px-5">Actions</th>
                              </tr>
                            </thead>
                            <tbody>
                              {gstInvoices.map(inv => (
                                <tr key={inv.id} className="border-b border-slate-50 hover:bg-slate-50/30 transition-colors">
                                  <td className="py-3 px-5">
                                    <div className="flex items-center gap-1.5"><Receipt className="h-3.5 w-3.5 text-purple-500" /><span className="text-xs font-bold text-purple-600">{inv.invoiceNumber}</span></div>
                                  </td>
                                  <td className="py-3 px-5 text-xs text-slate-500">{fmtDate(inv.invoiceDate)}</td>
                                  <td className="py-3 px-5 text-xs text-slate-700">
                                    {inv.description}
                                    {inv.isInterstate && <Badge variant="outline" className="ml-2 text-[10px] rounded-md">Interstate</Badge>}
                                  </td>
                                  <td className="py-3 px-5 text-right text-xs text-slate-900 font-medium">₹{inv.subtotal.toFixed(2)}</td>
                                  <td className="py-3 px-5 text-right text-xs text-slate-500">
                                    ₹{inv.totalGst.toFixed(2)}
                                    <div className="text-[10px] text-slate-400">{inv.isInterstate ? `IGST: ₹${inv.igst.toFixed(2)}` : `CGST: ₹${inv.cgst.toFixed(2)} | SGST: ₹${inv.sgst.toFixed(2)}`}</div>
                                  </td>
                                  <td className="py-3 px-5 text-right text-xs font-bold text-slate-800">₹{inv.totalAmount.toFixed(2)}</td>
                                  <td className="py-3 px-5">
                                    <div className="flex items-center justify-center gap-1.5">
                                      <Button size="sm" variant="outline" onClick={() => window.open(`/api/gst-invoices/${inv.id}/pdf`, '_blank')} className="h-7 px-2 border-slate-200 text-slate-600 rounded-lg bg-white hover:bg-slate-50" title="View">
                                        <Eye className="h-3.5 w-3.5" />
                                      </Button>
                                      <Button size="sm" onClick={() => window.open(`/api/gst-invoices/${inv.id}/pdf`, '_blank')} className="h-7 px-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg" title="Download">
                                        <Download className="h-3.5 w-3.5" />
                                      </Button>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </div>

        {/* ── 4. Admin Audit Log ──────────────────────────────────────── */}
        {isAdmin && auditSettings.length > 0 && (
          <Card className="border border-slate-100 shadow-sm rounded-2xl overflow-hidden">
            <CardHeader className="bg-slate-50/50 border-b border-slate-100 px-5 py-4">
              <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <History className="h-4 w-4 text-slate-500" />
                Settings Audit Log
              </CardTitle>
              <CardDescription className="text-xs text-slate-500 mt-0.5">Last known values and who updated each setting</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-slate-100">
                {auditSettings.map((s: any) => (
                  <div key={s.key} className="flex flex-col sm:flex-row sm:items-center sm:justify-between px-5 py-3 hover:bg-slate-50 transition-colors">
                    <div className="space-y-0.5">
                      <div className="text-xs font-mono font-semibold text-slate-800 uppercase">{s.key}</div>
                      <div className="text-xs text-slate-500">
                        Value: <span className="font-mono bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded font-semibold">{s.value}</span>
                      </div>
                    </div>
                    <div className="text-xs text-slate-400 mt-2 sm:mt-0 sm:text-right space-y-0.5">
                      <div>{new Date(s.updatedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })}</div>
                      {s.updatedByUserEmail && <div className="text-blue-500">{s.updatedByUserEmail}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

      </div>

      <RazorpayTopupDialog open={razorpayDialogOpen} onOpenChange={setRazorpayDialogOpen} onSuccess={refreshBilling} />
    </div>
  );
}
