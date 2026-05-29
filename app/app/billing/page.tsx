'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BackButton } from '@/components/ui/back-button';
import { Badge } from '@/components/ui/badge';
import { 
  CheckCircle,
  FileText,
  User,
  CreditCard,
  IndianRupee,
  Loader2,
  Plus,
  Minus,
  Calendar,
  Activity,
  Download,
  Eye,
  Receipt,
  Phone,
  Clock
} from 'lucide-react';
import { RazorpayTopupDialog } from '@/components/ui/razorpay-topup-dialog';

interface BillingSettings {
  billCost: number;
  freeTrialBills: number;
  freeTrialUsed: number;
  freeTrialRemaining: number;
  isTrialActive: boolean;
  isFreeAccount: boolean;
  customProcessingFee: number | null;
}

interface CreditBalance {
  balance: number;
  nextBillCost: number;
  canAffordNextBill: boolean;
  showLowCreditWarning: boolean;
  paymentProcessingEnabled: boolean;
  isPaidUser: boolean;
  trialInfo: {
    isActive: boolean;
    billsUsed: number;
    billsRemaining: number;
    billsTotal: number;
  };
  accountInfo: {
    tier: string;
    monthlyBillCount: number;
    status: string;
  };
}

interface CreditTransaction {
  id: string;
  amount: number;
  type: string;
  reason: string;
  balanceBefore: number;
  balanceAfter: number;
  createdAt: string;
  adminUserEmail?: string;
  billId?: string;
}

interface GstInvoice {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  customerName: string;
  customerEmail: string;
  subtotal: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalGst: number;
  totalAmount: number;
  description: string;
  isInterstate: boolean;
  razorpayTransactionId: string;
}

export default function BillingPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [billingSettings, setBillingSettings] = useState<BillingSettings | null>(null);
  const [creditBalance, setCreditBalance] = useState<CreditBalance | null>(null);
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [gstInvoices, setGstInvoices] = useState<GstInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [transactionsLoading, setTransactionsLoading] = useState(true);
  const [invoicesLoading, setInvoicesLoading] = useState(true);
  const [razorpayDialogOpen, setRazorpayDialogOpen] = useState(false);
  const [razorpayEnabled, setRazorpayEnabled] = useState(false);
  const [activeTab, setActiveTab] = useState<'transactions' | 'invoices'>('transactions');

  // Redirect unauthenticated users to sign in
  useEffect(() => {
    if (status === 'loading') return;
    
    if (!session) {
      router.push('/auth/signin');
      return;
    }
  }, [status, session, router]);

  useEffect(() => {
    // Fetch billing settings and credit balance
    const fetchData = async () => {
      try {
        const [settingsRes, balanceRes] = await Promise.all([
          fetch('/api/billing/settings'),
          fetch('/api/credits/balance')
        ]);
        
        if (settingsRes.ok) {
          const data = await settingsRes.json();
          setBillingSettings(data);
        }
        
        if (balanceRes.ok) {
          const data = await balanceRes.json();
          setCreditBalance(data);
        }
      } catch (error) {
        console.error('Error fetching billing data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  useEffect(() => {
    // Fetch credit transactions
    const fetchTransactions = async () => {
      try {
        const response = await fetch('/api/credits/transactions');
        if (response.ok) {
          const data = await response.json();
          setTransactions(data.transactions || []);
        }
      } catch (error) {
        console.error('Error fetching transactions:', error);
      } finally {
        setTransactionsLoading(false);
      }
    };

    fetchTransactions();
  }, []);

  useEffect(() => {
    // Fetch Razorpay config
    const fetchRazorpayConfig = async () => {
      try {
        const response = await fetch('/api/razorpay/config');
        if (response.ok) {
          const data = await response.json();
          setRazorpayEnabled(data.enabled);
        }
      } catch (error) {
        console.error('Error fetching Razorpay config:', error);
      }
    };

    fetchRazorpayConfig();
  }, []);

  useEffect(() => {
    // Fetch GST invoices
    const fetchGstInvoices = async () => {
      try {
        const response = await fetch('/api/gst-invoices');
        if (response.ok) {
          const data = await response.json();
          setGstInvoices(data.invoices || []);
        }
      } catch (error) {
        console.error('Error fetching GST invoices:', error);
      } finally {
        setInvoicesLoading(false);
      }
    };

    fetchGstInvoices();
  }, []);

  const handleTopupSuccess = async () => {
    try {
      const [balanceRes, transactionsRes, invoicesRes] = await Promise.all([
        fetch('/api/credits/balance'),
        fetch('/api/credits/transactions'),
        fetch('/api/gst-invoices'),
      ]);
      
      if (balanceRes.ok) {
        const data = await balanceRes.json();
        setCreditBalance(data);
      }
      
      if (transactionsRes.ok) {
        const data = await transactionsRes.json();
        setTransactions(data.transactions || []);
      }
      
      if (invoicesRes.ok) {
        const data = await invoicesRes.json();
        setGstInvoices(data.invoices || []);
      }
    } catch (error) {
      console.error('Error refreshing data:', error);
    }
  };

  const handleDownloadInvoice = (invoiceId: string) => {
    window.open(`/api/gst-invoices/${invoiceId}/pdf`, '_blank');
  };

  const handleViewInvoice = (invoiceId: string) => {
    window.open(`/api/gst-invoices/${invoiceId}/pdf`, '_blank');
  };

  // Get effective bill cost
  const effectiveBillCost = billingSettings?.isFreeAccount 
    ? 0 
    : billingSettings?.customProcessingFee !== null && billingSettings?.customProcessingFee !== undefined
      ? billingSettings.customProcessingFee
      : billingSettings?.billCost || 10;

  // Format date
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-IN', { 
      day: '2-digit', 
      month: 'short', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Get transaction icon and color
  const getTransactionIcon = (type: string) => {
    switch (type) {
      case 'add':
        return <Plus className="h-4 w-4 text-green-600" />;
      case 'deduct':
      case 'bill_usage':
        return <Minus className="h-4 w-4 text-red-600" />;
      case 'refund':
        return <CheckCircle className="h-4 w-4 text-blue-600" />;
      default:
        return <Activity className="h-4 w-4 text-slate-600" />;
    }
  };

  const getTransactionColor = (type: string) => {
    switch (type) {
      case 'add':
        return 'text-green-600 font-semibold';
      case 'deduct':
      case 'bill_usage':
        return 'text-red-600 font-semibold';
      case 'refund':
        return 'text-blue-600 font-semibold';
      default:
        return 'text-slate-600';
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <div className="space-y-6">
        <BackButton href="/contracts" className="mb-4" />
        
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3.5">
            <CreditCard className="h-8 w-8 text-purple-600 animate-pulse" />
            Credit & Billing Management
          </h1>
          <p className="text-slate-500 mt-1.5 leading-normal">
            Manage your account credits, view statements, download GST invoices, and track transactions.
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12 bg-white border border-slate-100 rounded-2xl shadow-sm min-h-[300px]">
            <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
            <span className="ml-3 text-slate-500 text-sm font-medium">Loading billing registry...</span>
          </div>
        ) : (
          <>
            {/* Credit Balance Overview */}
            <div className={`grid grid-cols-1 ${effectiveBillCost === 0 ? 'md:grid-cols-2' : 'md:grid-cols-3'} gap-6`}>
              {/* Current Balance / Unlimited Plan Card */}
              <Card className="border border-slate-100 shadow-sm bg-white rounded-2xl overflow-hidden hover:scale-[1.005] transition-transform duration-200">
                <CardHeader className="bg-slate-50/50 border-b border-slate-100 p-5">
                  <CardTitle className="flex items-center justify-between text-slate-900 text-base font-bold">
                    <span className="flex items-center gap-2">
                      <CreditCard className="h-5 w-5 text-purple-600" />
                      {effectiveBillCost === 0 ? 'Account Pricing Tier' : 'Current Balance'}
                    </span>
                    {creditBalance && (
                      <Badge variant="secondary" className="bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-100 text-[10px] rounded-lg font-semibold px-2 py-0.5">
                        {creditBalance.accountInfo.tier}
                      </Badge>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-5">
                  {effectiveBillCost === 0 ? (
                    <div className="space-y-3">
                      <div className="p-4 bg-gradient-to-br from-purple-50 to-indigo-50/50 border border-purple-100 rounded-2xl">
                        <span className="text-[10px] font-bold text-purple-500 uppercase tracking-wider block mb-1">Active Plan</span>
                        <span className="text-2xl font-black text-purple-700 block">
                          Unlimited Free Plan
                        </span>
                        <p className="text-xs text-purple-600/90 mt-1 leading-relaxed">
                          This account is registered on the free Railway tier. All Price Variation Clause (PVC) bills are processed at zero credit cost.
                        </p>
                      </div>
                      
                      <div className="text-[11px] text-slate-500 space-y-1.5 pt-1">
                        <div className="flex justify-between items-center">
                          <span>Next Bill Cost:</span>
                          <span className="font-semibold text-green-600 flex items-center gap-0.5">
                            <CheckCircle className="h-3 w-3" /> Free (₹0)
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span>Total Bills Generated:</span>
                          <span className="font-semibold text-slate-700">{creditBalance?.accountInfo.monthlyBillCount || 0} bills</span>
                        </div>
                      </div>
                    </div>
                  ) : creditBalance?.trialInfo.isActive ? (
                    <div className="space-y-2">
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">Trial Status</span>
                      <span className="text-3xl font-bold text-green-600 block">
                        {creditBalance.trialInfo.billsRemaining} Bills
                      </span>
                      <p className="text-xs text-slate-500">
                        {creditBalance.trialInfo.billsUsed} of {creditBalance.trialInfo.billsTotal} free trial bills consumed
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-0.5">Available Credits</span>
                      <div className="text-3xl font-bold text-slate-900">
                        ₹{creditBalance?.balance.toFixed(2) || '0.00'}
                      </div>
                      <div className="text-[11px] text-slate-500 space-y-1.5 pt-1.5 border-t border-slate-50">
                        <div className="flex justify-between">
                          <span>Next Bill Cost:</span>
                          <span className="font-semibold text-slate-700">₹{creditBalance?.nextBillCost || effectiveBillCost}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Monthly Bill Count:</span>
                          <span className="font-semibold text-slate-700">{creditBalance?.accountInfo.monthlyBillCount || 0} bills</span>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {/* Status indicator */}
                  <div className="mt-4 pt-4 border-t border-slate-100 flex items-center gap-2">
                    <div className={`w-2.5 h-2.5 rounded-full animate-pulse ${
                      effectiveBillCost === 0 || creditBalance?.canAffordNextBill || (creditBalance?.trialInfo.billsRemaining || 0) > 0
                        ? 'bg-green-500' 
                        : 'bg-red-500'
                    }`} />
                    <span className="text-xs text-slate-600 font-semibold">
                      {effectiveBillCost === 0 || creditBalance?.canAffordNextBill || (creditBalance?.trialInfo.billsRemaining || 0) > 0
                        ? 'Unlimited Bill Creation Active' 
                        : 'Insufficient Credits'
                      }
                    </span>
                  </div>
                </CardContent>
              </Card>

              {/* Top-up Methods Card (Paid Only) */}
              {effectiveBillCost > 0 && (
                <Card className="border border-slate-100 shadow-sm bg-white rounded-2xl overflow-hidden hover:scale-[1.005] transition-transform duration-200">
                  <CardHeader className="bg-slate-50/50 border-b border-slate-100 p-5">
                    <CardTitle className="flex items-center gap-2 text-slate-900 text-base font-bold">
                      <IndianRupee className="h-5 w-5 text-purple-600" />
                      Credit Top-Up
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-5 space-y-4">
                    {razorpayEnabled && (
                      <Button
                        onClick={() => setRazorpayDialogOpen(true)}
                        className="w-full bg-purple-600 hover:bg-purple-700 text-white rounded-xl h-10 text-xs font-bold shadow-md shadow-purple-500/10 transition-transform active:scale-[0.98]"
                      >
                        <CreditCard className="h-4 w-4 mr-2" />
                        Top-Up via Razorpay
                      </Button>
                    )}
                    
                    <div className="p-3.5 bg-slate-50 border border-slate-100 rounded-xl space-y-2">
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        Manual Addition Contact
                      </div>
                      <div className="flex items-center gap-2 text-slate-800 text-xs font-semibold">
                        <User className="h-3.5 w-3.5 text-purple-500" />
                        Prasath Kumar (Admin)
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <Phone className="h-3.5 w-3.5 text-purple-500" />
                        <a href="tel:+919944776689" className="text-purple-600 font-bold hover:underline">
                          +91 9944776689
                        </a>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Billing Info Card */}
              <Card className="border border-slate-100 shadow-sm bg-white rounded-2xl overflow-hidden hover:scale-[1.005] transition-transform duration-200">
                <CardHeader className="bg-slate-50/50 border-b border-slate-100 p-5">
                  <CardTitle className="flex items-center gap-2 text-slate-900 text-base font-bold">
                    <FileText className="h-5 w-5 text-purple-600" />
                    Billing Configuration
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-5">
                  {effectiveBillCost === 0 ? (
                    <div className="space-y-3">
                      <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl flex justify-between items-center">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Cost Per PVC Bill</span>
                        <span className="text-sm font-bold text-green-600 flex items-center gap-0.5">
                          ✓ Free (₹0)
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 leading-relaxed">
                        Your account is exempted from credit deductions. You can generate unlimited monthly and cumulative bills at zero credit costs.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl flex justify-between items-center">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Cost Per PVC Bill</span>
                        <span className="text-xl font-bold text-purple-600">
                          ₹{effectiveBillCost.toLocaleString()}
                        </span>
                      </div>
                      
                      {billingSettings?.isTrialActive && (
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-slate-500">Free trial remainder:</span>
                          <span className="font-semibold text-slate-700">
                            {billingSettings.freeTrialRemaining} of {billingSettings.freeTrialBills} bills
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Credit Statement & GST Invoices (Shown only if paid OR if transactions exist) */}
            {(effectiveBillCost > 0 || transactions.length > 0) && (
              <Card className="border border-slate-100 shadow-sm bg-white rounded-2xl overflow-hidden">
                <CardHeader className="bg-slate-50/50 border-b border-slate-100 p-5">
                  <CardTitle className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-base font-bold text-slate-900">
                      <Activity className="h-5 w-5 text-purple-600" />
                      {effectiveBillCost === 0 || activeTab === 'transactions' ? 'Credit Transactions Statement' : 'GST Billing Invoices'}
                    </span>
                    {effectiveBillCost > 0 && (
                      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
                        <Button
                          variant={activeTab === 'transactions' ? 'default' : 'ghost'}
                          size="sm"
                          onClick={() => setActiveTab('transactions')}
                          className={`text-xs h-8 px-3 rounded-lg ${activeTab === 'transactions' ? 'bg-white text-slate-900 shadow-sm hover:bg-white' : 'text-slate-500 hover:text-slate-800'}`}
                        >
                          <Activity className="h-3.5 w-3.5 mr-1" />
                          Transactions
                        </Button>
                        <Button
                          variant={activeTab === 'invoices' ? 'default' : 'ghost'}
                          size="sm"
                          onClick={() => setActiveTab('invoices')}
                          className={`text-xs h-8 px-3 rounded-lg ${activeTab === 'invoices' ? 'bg-white text-slate-900 shadow-sm hover:bg-white' : 'text-slate-500 hover:text-slate-800'}`}
                        >
                          <Receipt className="h-3.5 w-3.5 mr-1" />
                          GST Invoices
                        </Button>
                      </div>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {effectiveBillCost === 0 || activeTab === 'transactions' ? (
                    transactionsLoading ? (
                      <div className="flex items-center justify-center py-12">
                        <Loader2 className="h-6 w-6 animate-spin text-purple-600" />
                        <span className="ml-2 text-slate-500 text-xs font-semibold">Loading credit statements...</span>
                      </div>
                    ) : transactions.length === 0 ? (
                      <div className="text-center py-12">
                        <Clock className="h-10 w-10 text-slate-300 mx-auto mb-2" />
                        <p className="text-slate-600 font-bold text-sm">No Transactions Found</p>
                        <p className="text-xs text-slate-400 mt-1">
                          Any credit transactions, checks, or bill generation fees will appear here
                        </p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-slate-100 bg-slate-50/50 text-slate-500 text-xs font-bold uppercase tracking-wider">
                              <th className="text-left py-3.5 px-5 font-semibold">Date & Time</th>
                              <th className="text-left py-3.5 px-5 font-semibold">Type</th>
                              <th className="text-left py-3.5 px-5 font-semibold">Description</th>
                              <th className="text-right py-3.5 px-5 font-semibold">Amount</th>
                              <th className="text-right py-3.5 px-5 font-semibold">Balance</th>
                            </tr>
                          </thead>
                          <tbody>
                            {transactions.map((txn) => (
                              <tr key={txn.id} className="border-b border-slate-50 hover:bg-slate-50/30 transition-colors">
                                <td className="py-3 px-5 text-xs text-slate-500">
                                  <div className="flex items-center gap-1.5">
                                    <Calendar className="h-3.5 w-3.5 text-slate-400" />
                                    {formatDate(txn.createdAt)}
                                  </div>
                                </td>
                                <td className="py-3 px-5">
                                  <div className="flex items-center gap-1.5">
                                    {getTransactionIcon(txn.type)}
                                    <span className="text-xs font-medium capitalize text-slate-700">
                                      {txn.type.replace('_', ' ')}
                                    </span>
                                  </div>
                                </td>
                                <td className="py-3 px-5 text-slate-700 text-xs">
                                  {txn.reason}
                                  {txn.adminUserEmail && (
                                    <div className="text-[10px] text-slate-400 mt-0.5">
                                      Authorized by: {txn.adminUserEmail}
                                    </div>
                                  )}
                                </td>
                                <td className={`py-3 px-5 text-right text-xs ${getTransactionColor(txn.type)}`}>
                                  {txn.amount >= 0 ? '+' : ''}₹{txn.amount.toFixed(2)}
                                </td>
                                <td className="py-3 px-5 text-right text-xs font-bold text-slate-800">
                                  ₹{txn.balanceAfter.toFixed(2)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )
                  ) : (
                    // GST Invoices Tab
                    invoicesLoading ? (
                      <div className="flex items-center justify-center py-12">
                        <Loader2 className="h-6 w-6 animate-spin text-purple-600" />
                        <span className="ml-2 text-slate-500 text-xs font-semibold">Loading GST Invoices...</span>
                      </div>
                    ) : gstInvoices.length === 0 ? (
                      <div className="text-center py-12">
                        <Receipt className="h-10 w-10 text-slate-300 mx-auto mb-2" />
                        <p className="text-slate-600 font-bold text-sm">No GST Invoices Found</p>
                        <p className="text-xs text-slate-400 mt-1">
                          GST invoices are generated automatically upon successful top-up transactions
                        </p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-slate-100 bg-slate-50/50 text-slate-500 text-xs font-bold uppercase tracking-wider">
                              <th className="text-left py-3.5 px-5 font-semibold">Invoice No.</th>
                              <th className="text-left py-3.5 px-5 font-semibold">Date</th>
                              <th className="text-left py-3.5 px-5 font-semibold">Description</th>
                              <th className="text-right py-3.5 px-5 font-semibold">Amount</th>
                              <th className="text-right py-3.5 px-5 font-semibold">GST Details</th>
                              <th className="text-right py-3.5 px-5 font-semibold">Total</th>
                              <th className="text-center py-3.5 px-5 font-semibold">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {gstInvoices.map((invoice) => (
                              <tr key={invoice.id} className="border-b border-slate-50 hover:bg-slate-50/30 transition-colors">
                                <td className="py-3 px-5">
                                  <div className="flex items-center gap-1.5">
                                    <Receipt className="h-3.5 w-3.5 text-purple-500" />
                                    <span className="text-xs font-bold text-purple-600">
                                      {invoice.invoiceNumber}
                                    </span>
                                  </div>
                                </td>
                                <td className="py-3 px-5 text-xs text-slate-500">
                                  {formatDate(invoice.invoiceDate)}
                                </td>
                                <td className="py-3 px-5 text-xs text-slate-700">
                                  {invoice.description}
                                  {invoice.isInterstate && (
                                    <Badge variant="outline" className="ml-2 text-[10px] rounded-md">
                                      Interstate
                                    </Badge>
                                  )}
                                </td>
                                <td className="py-3 px-5 text-right text-xs text-slate-900 font-medium">
                                  ₹{invoice.subtotal.toFixed(2)}
                                </td>
                                <td className="py-3 px-5 text-right text-xs text-slate-500">
                                  ₹{invoice.totalGst.toFixed(2)}
                                  <div className="text-[10px] text-slate-400">
                                    {invoice.isInterstate 
                                      ? `IGST: ₹${invoice.igst.toFixed(2)}`
                                      : `CGST: ₹${invoice.cgst.toFixed(2)} | SGST: ₹${invoice.sgst.toFixed(2)}`
                                    }
                                  </div>
                                </td>
                                <td className="py-3 px-5 text-right text-xs font-bold text-slate-800">
                                  ₹{invoice.totalAmount.toFixed(2)}
                                </td>
                                <td className="py-3 px-5">
                                  <div className="flex items-center justify-center gap-1.5">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => handleViewInvoice(invoice.id)}
                                      className="h-8 px-2 border-slate-200 text-slate-600 rounded-lg bg-white hover:bg-slate-50"
                                      title="View Invoice"
                                    >
                                      <Eye className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="default"
                                      onClick={() => handleDownloadInvoice(invoice.id)}
                                      className="h-8 px-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg"
                                      title="Download PDF"
                                    >
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
          </>
        )}
      </div>

      {/* Razorpay Top-up Dialog */}
      <RazorpayTopupDialog
        open={razorpayDialogOpen}
        onOpenChange={setRazorpayDialogOpen}
        onSuccess={handleTopupSuccess}
      />
    </div>
  );
}
