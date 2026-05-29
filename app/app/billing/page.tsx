
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BackButton } from '@/components/ui/back-button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { 
  CheckCircle,
  FileText,
  ArrowRight,
  Phone,
  User,
  CreditCard,
  IndianRupee,
  Loader2,
  Gift,
  TrendingUp,
  TrendingDown,
  Clock,
  AlertCircle,
  Plus,
  Minus,
  Calendar,
  Activity,
  Download,
  Eye,
  Receipt
} from 'lucide-react';
import Link from 'next/link';
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
    // Refresh data after successful top-up
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
      : billingSettings?.billCost || 10; // Default matches BILL_PROCESSING_COST in admin settings

  const freeTrialText = billingSettings?.freeTrialBills === 1 
    ? '1 free bill' 
    : `${billingSettings?.freeTrialBills || 1} free bills`;

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
        return <TrendingUp className="h-4 w-4 text-blue-600" />;
      default:
        return <Activity className="h-4 w-4 text-gray-600" />;
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
        return 'text-gray-600';
    }
  };

  return (
    <div className="container mx-auto px-4 py-6 max-w-7xl">
      <div className="space-y-6">
        <BackButton href="/contracts" className="mb-4" />
        
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold text-gray-900 flex items-center justify-center gap-3">
            <CreditCard className="h-8 w-8 text-blue-600" />
            Credit & Billing Management
          </h1>
          <p className="text-gray-600 text-lg max-w-2xl mx-auto">
            Manage your account credits and billing information
          </p>
        </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          <span className="ml-3 text-gray-600">Loading billing information...</span>
        </div>
      ) : (
        <>
          {/* Credit Balance Overview */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Current Balance Card */}
            <Card className="border-0 shadow-lg bg-gradient-to-br from-blue-50 to-indigo-50">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center justify-between text-blue-800">
                  <span className="flex items-center gap-2">
                    <CreditCard className="h-5 w-5" />
                    Current Balance
                  </span>
                  {creditBalance && (
                    <Badge 
                      variant={creditBalance.accountInfo.status === 'active' ? 'default' : 'destructive'}
                      className="text-xs"
                    >
                      {creditBalance.accountInfo.tier}
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {creditBalance?.trialInfo.isActive ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Gift className="h-6 w-6 text-green-600" />
                      <span className="text-3xl font-bold text-green-600">
                        {creditBalance.trialInfo.billsRemaining}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600">
                      Free {creditBalance.trialInfo.billsTotal === 1 ? 'bill' : 'bills'} remaining
                    </p>
                    <div className="text-xs text-gray-500">
                      {creditBalance.trialInfo.billsUsed} of {creditBalance.trialInfo.billsTotal} used
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="text-4xl font-bold text-blue-600">
                      ₹{creditBalance?.balance.toFixed(2) || '0.00'}
                    </div>
                    <p className="text-sm text-gray-600">Available Credits</p>
                    <div className="text-xs text-gray-500 space-y-1">
                      <div className="flex justify-between">
                        <span>Next bill cost:</span>
                        <span className="font-medium">₹{creditBalance?.nextBillCost || effectiveBillCost}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Bills this month:</span>
                        <span className="font-medium">{creditBalance?.accountInfo.monthlyBillCount || 0}</span>
                      </div>
                    </div>
                  </div>
                )}
                
                {/* Status indicator */}
                <div className="mt-4 pt-4 border-t flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${
                      creditBalance?.canAffordNextBill || (creditBalance?.trialInfo.billsRemaining || 0) > 0
                        ? 'bg-green-500' 
                        : 'bg-red-500'
                    }`} />
                    <span className="text-xs text-gray-600">
                      {creditBalance?.canAffordNextBill || (creditBalance?.trialInfo.billsRemaining || 0) > 0
                        ? 'Ready to process bills' 
                        : 'Cannot process bills'
                      }
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Top-up Methods Card */}
            <Card className="border-0 shadow-lg bg-gradient-to-br from-green-50 to-emerald-50">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-green-800">
                  <CreditCard className="h-5 w-5" />
                  Credit Top-up Options
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {razorpayEnabled && (
                  <div className="space-y-2">
                    <Button
                      onClick={() => setRazorpayDialogOpen(true)}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                      size="lg"
                    >
                      <CreditCard className="h-4 w-4 mr-2" />
                      Top-up via Razorpay
                    </Button>
                    <p className="text-xs text-center text-gray-600">
                      Instant credit top-up with GST invoice
                    </p>
                  </div>
                )}
                
                <div className="bg-white p-4 rounded-lg border border-green-200">
                  <div className="text-sm font-semibold text-gray-900 mb-2">
                    Manual Top-up Contact
                  </div>
                  <div className="flex items-center gap-3 mb-2">
                    <User className="h-4 w-4 text-green-600" />
                    <span className="text-sm font-medium text-gray-900">Prasath Kumar</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Phone className="h-4 w-4 text-green-600" />
                    <a 
                      href="tel:+919944776689" 
                      className="text-sm font-semibold text-green-700 hover:text-green-800 hover:underline transition-colors"
                    >
                      +91 9944776689
                    </a>
                  </div>
                </div>
                
                <div className="bg-amber-50 border border-amber-200 p-3 rounded-lg">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-amber-800">
                      {razorpayEnabled 
                        ? 'Use Razorpay for instant top-up or contact above for manual credit addition.'
                        : 'Contact above number to add credits to your account. Credits are added manually after payment confirmation.'
                      }
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Billing Info Card */}
            <Card className="border-0 shadow-lg bg-gradient-to-br from-purple-50 to-pink-50">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-purple-800">
                  <IndianRupee className="h-5 w-5" />
                  Billing Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {billingSettings?.isFreeAccount ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-green-700">
                      <CheckCircle className="h-4 w-4" />
                      <span className="font-semibold">Free Account</span>
                    </div>
                    <p className="text-sm text-gray-600">
                      All bills are processed at no cost. Unlimited bill processing.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="bg-white p-3 rounded border border-purple-200">
                      <div className="text-sm text-gray-600 mb-1">Cost per bill</div>
                      <div className="text-2xl font-bold text-purple-600">
                        ₹{effectiveBillCost.toLocaleString()}
                      </div>
                    </div>
                    
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-gray-600">Trial status:</span>
                        <span className="font-medium">
                          {billingSettings?.isTrialActive && billingSettings.freeTrialRemaining > 0
                            ? `${billingSettings.freeTrialRemaining} of ${billingSettings.freeTrialBills} remaining`
                            : 'Completed'
                          }
                        </span>
                      </div>
                    </div>
                  </div>
                )}
                
                <div className="pt-3 border-t space-y-2">
                  <div className="flex items-center gap-2 text-gray-700">
                    <CheckCircle className="h-3 w-3" />
                    <span className="text-xs">Accurate PVC calculations</span>
                  </div>
                  <div className="flex items-center gap-2 text-gray-700">
                    <CheckCircle className="h-3 w-3" />
                    <span className="text-xs">Detailed PDF reports</span>
                  </div>
                  <div className="flex items-center gap-2 text-gray-700">
                    <CheckCircle className="h-3 w-3" />
                    <span className="text-xs">GCC compliance verified</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Credit Statement & GST Invoices */}
          <Card className="border-0 shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Activity className="h-5 w-5 text-blue-600" />
                  {activeTab === 'transactions' ? 'Credit Statement' : 'GST Invoices'}
                </span>
                <div className="flex gap-2">
                  <Button
                    variant={activeTab === 'transactions' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setActiveTab('transactions')}
                    className="text-xs"
                  >
                    <Activity className="h-3 w-3 mr-1" />
                    Transactions
                  </Button>
                  <Button
                    variant={activeTab === 'invoices' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setActiveTab('invoices')}
                    className="text-xs"
                  >
                    <Receipt className="h-3 w-3 mr-1" />
                    GST Invoices
                  </Button>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {activeTab === 'transactions' ? (
                transactionsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
                    <span className="ml-2 text-gray-600">Loading transactions...</span>
                  </div>
                ) : transactions.length === 0 ? (
                  <div className="text-center py-8">
                    <Clock className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                    <p className="text-gray-600">No transactions yet</p>
                    <p className="text-sm text-gray-500 mt-1">
                      Your credit transactions will appear here
                    </p>
                  </div>
                ) : (
                <div className="space-y-2">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b text-sm text-gray-600">
                          <th className="text-left py-2 px-3">Date & Time</th>
                          <th className="text-left py-2 px-3">Type</th>
                          <th className="text-left py-2 px-3">Description</th>
                          <th className="text-right py-2 px-3">Amount</th>
                          <th className="text-right py-2 px-3">Balance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {transactions.map((txn) => (
                          <tr key={txn.id} className="border-b hover:bg-gray-50">
                            <td className="py-3 px-3 text-sm text-gray-600">
                              <div className="flex items-center gap-2">
                                <Calendar className="h-3 w-3" />
                                {formatDate(txn.createdAt)}
                              </div>
                            </td>
                            <td className="py-3 px-3">
                              <div className="flex items-center gap-2">
                                {getTransactionIcon(txn.type)}
                                <span className="text-xs font-medium capitalize">
                                  {txn.type.replace('_', ' ')}
                                </span>
                              </div>
                            </td>
                            <td className="py-3 px-3 text-sm text-gray-700">
                              {txn.reason}
                              {txn.adminUserEmail && (
                                <div className="text-xs text-gray-500 mt-0.5">
                                  By: {txn.adminUserEmail}
                                </div>
                              )}
                            </td>
                            <td className={`py-3 px-3 text-right text-sm ${getTransactionColor(txn.type)}`}>
                              {txn.amount >= 0 ? '+' : ''}₹{txn.amount.toFixed(2)}
                            </td>
                            <td className="py-3 px-3 text-right text-sm font-medium text-gray-900">
                              ₹{txn.balanceAfter.toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                )
              ) : (
                // GST Invoices Tab
                invoicesLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
                    <span className="ml-2 text-gray-600">Loading invoices...</span>
                  </div>
                ) : gstInvoices.length === 0 ? (
                  <div className="text-center py-8">
                    <Receipt className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                    <p className="text-gray-600">No GST invoices yet</p>
                    <p className="text-sm text-gray-500 mt-1">
                      GST invoices will be generated when you make payments
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b text-sm text-gray-600">
                            <th className="text-left py-2 px-3">Invoice No.</th>
                            <th className="text-left py-2 px-3">Date</th>
                            <th className="text-left py-2 px-3">Description</th>
                            <th className="text-right py-2 px-3">Amount</th>
                            <th className="text-right py-2 px-3">GST</th>
                            <th className="text-right py-2 px-3">Total</th>
                            <th className="text-center py-2 px-3">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {gstInvoices.map((invoice) => (
                            <tr key={invoice.id} className="border-b hover:bg-gray-50">
                              <td className="py-3 px-3">
                                <div className="flex items-center gap-2">
                                  <Receipt className="h-3 w-3 text-blue-600" />
                                  <span className="text-sm font-medium text-blue-600">
                                    {invoice.invoiceNumber}
                                  </span>
                                </div>
                              </td>
                              <td className="py-3 px-3 text-sm text-gray-600">
                                {formatDate(invoice.invoiceDate)}
                              </td>
                              <td className="py-3 px-3 text-sm text-gray-700">
                                {invoice.description}
                                {invoice.isInterstate && (
                                  <Badge variant="outline" className="ml-2 text-xs">
                                    Interstate
                                  </Badge>
                                )}
                              </td>
                              <td className="py-3 px-3 text-right text-sm text-gray-900">
                                ₹{invoice.subtotal.toFixed(2)}
                              </td>
                              <td className="py-3 px-3 text-right text-sm text-gray-600">
                                ₹{invoice.totalGst.toFixed(2)}
                                <div className="text-xs text-gray-500">
                                  {invoice.isInterstate 
                                    ? `IGST: ₹${invoice.igst.toFixed(2)}`
                                    : `CGST: ₹${invoice.cgst.toFixed(2)} | SGST: ₹${invoice.sgst.toFixed(2)}`
                                  }
                                </div>
                              </td>
                              <td className="py-3 px-3 text-right text-sm font-bold text-gray-900">
                                ₹{invoice.totalAmount.toFixed(2)}
                              </td>
                              <td className="py-3 px-3">
                                <div className="flex items-center justify-center gap-2">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleViewInvoice(invoice.id)}
                                    className="h-8 px-2"
                                    title="View Invoice"
                                  >
                                    <Eye className="h-3 w-3" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="default"
                                    onClick={() => handleDownloadInvoice(invoice.id)}
                                    className="h-8 px-2"
                                    title="Download PDF"
                                  >
                                    <Download className="h-3 w-3" />
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )
              )}
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card className="border-0 shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-blue-600" />
                Quick Actions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Button asChild className="w-full justify-start" size="lg">
                  <Link href="/bills/new">
                    <FileText className="h-4 w-4 mr-2" />
                    Process New Bill
                    <ArrowRight className="h-4 w-4 ml-auto" />
                  </Link>
                </Button>
                
                <Button asChild variant="outline" className="w-full justify-start" size="lg">
                  <Link href="/contracts">
                    <FileText className="h-4 w-4 mr-2" />
                    Manage Contracts
                    <ArrowRight className="h-4 w-4 ml-auto" />
                  </Link>
                </Button>
                
                <Button asChild variant="outline" className="w-full justify-start" size="lg">
                  <Link href="/reports">
                    <FileText className="h-4 w-4 mr-2" />
                    View Reports
                    <ArrowRight className="h-4 w-4 ml-auto" />
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
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
