
'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Loader2, CreditCard, CheckCircle, IndianRupee, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import Script from 'next/script';
import { GstBillingDetailsDialog } from './gst-billing-details-dialog';

interface RazorpayTopupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

declare global {
  interface Window {
    Razorpay: any;
  }
}

type GstOption = 'include' | 'exclude' | 'without';

export function RazorpayTopupDialog({ 
  open, 
  onOpenChange,
  onSuccess 
}: RazorpayTopupDialogProps) {
  const [creditAmount, setCreditAmount] = useState<string>('100');
  const [gstOption, setGstOption] = useState<GstOption>('include');
  const [loading, setLoading] = useState(false);
  const [razorpayLoaded, setRazorpayLoaded] = useState(false);
  const [config, setConfig] = useState<{ enabled: boolean; keyId: string | null } | null>(null);
  
  // GST Invoice Dialog state
  const [showGstDialog, setShowGstDialog] = useState(false);
  const [gstInvoiceData, setGstInvoiceData] = useState<{
    transactionId: string;
    creditAmount: number;
    invoiceNumber: string;
  } | null>(null);

  const [configError, setConfigError] = useState<string | null>(null);
  const [configLoading, setConfigLoading] = useState(true);

  // Fetch Razorpay config with retry
  const fetchConfig = async (retryCount = 0) => {
    setConfigLoading(true);
    setConfigError(null);
    try {
      const res = await fetch('/api/razorpay/config');
      if (res.ok) {
        const data = await res.json();
        setConfig(data);
        setConfigError(null);
        console.log('[Razorpay] Config loaded:', { enabled: data.enabled, hasKeyId: !!data.keyId });
      } else if (res.status >= 500 && retryCount < 2) {
        console.warn(`[Razorpay] Config fetch failed (${res.status}), retrying... (${retryCount + 1}/2)`);
        await new Promise(r => setTimeout(r, 1500));
        return fetchConfig(retryCount + 1);
      } else {
        console.error('[Razorpay] Failed to fetch config:', res.status);
        setConfigError('Unable to load payment configuration. Please try again.');
      }
    } catch (error) {
      if (retryCount < 2) {
        console.warn(`[Razorpay] Config fetch error, retrying... (${retryCount + 1}/2)`);
        await new Promise(r => setTimeout(r, 1500));
        return fetchConfig(retryCount + 1);
      }
      console.error('[Razorpay] Error fetching config:', error);
      setConfigError('Unable to connect to server. Please check your internet connection and try again.');
    } finally {
      setConfigLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      // Reset states when dialog opens
      setLoading(false);
      setCreditAmount('100');
      setGstOption('include');
      setConfigError(null);
      fetchConfig();
    }
  }, [open]);

  const calculateTotalAmount = () => {
    const enteredAmount = parseFloat(creditAmount) || 0;
    
    // GST is always included - Full amount (including GST) goes to wallet
    // Calculate GST component: enteredAmount = baseAmount * 1.18
    // So baseAmount = enteredAmount / 1.18
    // And GST = enteredAmount - baseAmount
    const baseAmount = enteredAmount / 1.18;
    const gst = enteredAmount - baseAmount;
    
    return { 
      enteredAmount,           // What user enters
      baseAmount,              // Base amount before GST
      creditToReceive: enteredAmount, // Full amount including GST goes to wallet
      gst,                     // GST component (18%)
      totalToPay: enteredAmount // What user pays
    };
  };

  const handlePayment = async () => {
    if (!razorpayLoaded) {
      toast.error('Razorpay is loading. Please wait...');
      return;
    }

    if (!config?.enabled || !config?.keyId) {
      toast.error('Razorpay is not configured');
      return;
    }

    const amount = parseFloat(creditAmount);
    if (!amount || amount <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    if (amount < 1) {
      toast.error('Minimum top-up amount is ₹1');
      return;
    }

    setLoading(true);

    try {
      // Create order with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

      const orderRes = await fetch('/api/razorpay/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          creditAmount: creditToReceive,
          totalAmount: totalToPay,
          gstAmount: gst,
          gstOption: gstOption 
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!orderRes.ok) {
        const errorData = await orderRes.json().catch(() => ({ error: 'Failed to create order' }));
        throw new Error(errorData.message || errorData.error || 'Failed to create order');
      }

      const orderData = await orderRes.json();
      console.log('[Razorpay] Order created successfully:', {
        orderId: orderData.orderId,
        amount: orderData.amount,
        transactionId: orderData.transactionId,
      });

      // Open Razorpay checkout
      const options = {
        key: config.keyId,
        amount: orderData.amount * 100, // Convert to paise
        currency: orderData.currency,
        name: 'Railway PVC System',
        description: `Credit Top-up - ₹${amount}`,
        order_id: orderData.orderId,
        handler: async function (response: any) {
          console.log('[Razorpay] Payment successful, verifying...', {
            order_id: response.razorpay_order_id,
            payment_id: response.razorpay_payment_id,
            signature: response.razorpay_signature ? 'Present' : 'Missing'
          });
          
          try {
            // Verify payment
            const verifyRes = await fetch('/api/razorpay/verify-payment', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                transactionId: orderData.transactionId,
              }),
            });

            console.log('[Razorpay] Verification response status:', verifyRes.status);

            if (!verifyRes.ok) {
              const errorData = await verifyRes.json().catch(() => ({}));
              console.error('[Razorpay] Verification failed:', errorData);
              throw new Error(errorData.error || 'Payment verification failed');
            }

            const verifyData = await verifyRes.json();
            console.log('[Razorpay] Verification successful:', verifyData);
            
            if (verifyData.alreadyProcessed) {
              toast.success(
                `Payment already processed! Your credits have been added.`,
                { duration: 5000 }
              );
              
              setLoading(false);
              
              // Reload page to show updated balance
              setTimeout(() => {
                window.location.reload();
              }, 1500);
            } else {
              toast.success(
                `Payment successful! ₹${verifyData.creditAmount} credits added.`,
                { duration: 5000 }
              );
              
              setLoading(false);
              
              // Show GST billing details dialog
              setGstInvoiceData({
                transactionId: verifyData.transactionId,
                creditAmount: verifyData.creditAmount,
                invoiceNumber: verifyData.invoiceNumber,
              });
              setShowGstDialog(true);
            }
            
            if (onSuccess) {
              onSuccess();
            }
          } catch (error: any) {
            console.error('[Razorpay] Payment verification error:', error);
            setLoading(false);
            toast.error(
              `⚠️ Payment Verification Failed\n\n${error.message}\n\nYour payment was received but credits were not added. Please contact support with Order ID: ${response.razorpay_order_id}`,
              { duration: 15000 }
            );
          }
        },
        prefill: {
          name: '',
          email: '',
          contact: '',
        },
        notes: {
          creditAmount: amount,
        },
        theme: {
          color: '#3B82F6',
        },
        modal: {
          ondismiss: function () {
            console.log('[Razorpay] Payment modal dismissed');
            setLoading(false);
            toast.info('Payment cancelled');
          },
          payment_failed: function (response: any) {
            console.error('Razorpay payment failed:', response);
            setLoading(false);
            
            // Extract error details
            const error = response.error || {};
            const code = error.code || 'UNKNOWN';
            const description = error.description || 'Payment failed';
            const reason = error.reason || '';
            const step = error.step || '';
            
            // Provide user-friendly error messages
            let userMessage = '';
            
            if (code === 'BAD_REQUEST_ERROR') {
              if (description.includes('payment-credential') || description.includes('token was declined')) {
                userMessage = '⚠️ Payment Authorization Failed\n\n' +
                  'Your payment method was declined. This could be due to:\n' +
                  '• Insufficient funds in your account\n' +
                  '• Card not authorized for online payments\n' +
                  '• Bank declined the transaction\n' +
                  '• Payment method not supported\n\n' +
                  'Please try:\n' +
                  '1. Using a different payment method\n' +
                  '2. Checking your account balance\n' +
                  '3. Contacting your bank to authorize the transaction';
              } else {
                userMessage = `Payment failed: ${description}`;
              }
            } else if (code === 'GATEWAY_ERROR') {
              userMessage = '⚠️ Payment Gateway Error\n\n' +
                'There was an issue with the payment gateway. Please try again in a few minutes.';
            } else if (code === 'SERVER_ERROR') {
              userMessage = '⚠️ Server Error\n\n' +
                'There was a temporary issue processing your payment. Please try again.';
            } else {
              userMessage = `Payment failed: ${description}\n\nError code: ${code}`;
            }
            
            toast.error(userMessage, { duration: 10000 });
          },
        },
      };

      console.log('[Razorpay] Opening checkout modal...');
      
      // Close the dialog before opening Razorpay to prevent z-index/overlay conflicts
      onOpenChange(false);
      
      const rzp = new window.Razorpay(options);
      rzp.open();
      
      // Reset loading state after Razorpay modal opens
      // The loading state will be managed by the modal callbacks
      setLoading(false);
    } catch (error: any) {
      console.error('Payment error:', error);
      
      // Handle different error types
      if (error.name === 'AbortError') {
        toast.error('Request timed out. Please check your internet connection and try again.');
      } else {
        toast.error(error.message || 'Failed to initiate payment');
      }
      
      // Always reset loading state on error
      setLoading(false);
    }
  };

  const { enteredAmount, baseAmount, creditToReceive, gst, totalToPay } = calculateTotalAmount();

  return (
    <>
      <Script
        src="https://checkout.razorpay.com/v1/checkout.js"
        onLoad={() => setRazorpayLoaded(true)}
        onError={() => {
          console.error('Failed to load Razorpay');
          toast.error('Failed to load payment gateway');
        }}
      />
      
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-blue-600" />
              Credit Top-up via Razorpay
            </DialogTitle>
            <DialogDescription>
              Add credits to your account using Razorpay payment gateway
            </DialogDescription>
          </DialogHeader>

          {configLoading && (
            <Alert>
              <Loader2 className="h-4 w-4 animate-spin" />
              <AlertDescription>
                Loading payment configuration...
              </AlertDescription>
            </Alert>
          )}

          {configError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="flex items-center justify-between">
                <span>{configError}</span>
                <Button variant="outline" size="sm" onClick={() => fetchConfig()} className="ml-2 shrink-0">
                  Retry
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {!configLoading && !configError && config && !config.enabled && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Razorpay payments are currently disabled. Please contact support or use manual top-up.
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="creditAmount">Credit Amount (₹)</Label>
              <div className="relative">
                <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                <Input
                  id="creditAmount"
                  type="number"
                  min="1"
                  step="1"
                  value={creditAmount}
                  onChange={(e) => setCreditAmount(e.target.value)}
                  className="pl-10"
                  placeholder="Enter amount"
                  disabled={loading || !config?.enabled}
                />
              </div>
              <p className="text-xs text-gray-500">
                Minimum: ₹1 | Suggested: ₹100, ₹1000, ₹5000, ₹10000
              </p>
            </div>

            {/* GST Information - Include GST Only */}
            <div className="space-y-2">
              <Label>GST Information</Label>
              <div className="flex items-center space-x-2 bg-blue-50 border border-blue-200 rounded-lg p-3">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">
                    GST (18%) is included in your payment
                  </p>
                  <p className="text-xs text-gray-600 mt-1">
                    The full amount you pay (including GST) will be added to your wallet
                  </p>
                </div>
              </div>
            </div>

            {/* Price Breakdown */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-700">Base Amount:</span>
                <span className="font-medium">₹{baseAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-700">GST (18%):</span>
                <span className="font-medium">₹{gst.toFixed(2)}</span>
              </div>
              <div className="border-t border-blue-300 pt-2 flex justify-between text-base font-semibold">
                <span className="text-gray-900">Total to Pay:</span>
                <span className="text-blue-600">₹{totalToPay.toFixed(2)}</span>
              </div>
              <div className="border-t border-blue-300 pt-2 flex justify-between text-base font-bold">
                <span className="text-green-700">Credits to Wallet:</span>
                <span className="text-green-600">₹{creditToReceive.toFixed(2)}</span>
              </div>
            </div>

            <Alert>
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-xs">
                After successful payment, the full amount (including GST) will be added to your wallet instantly. 
                You'll then be asked to provide billing details to generate the GST invoice.
              </AlertDescription>
            </Alert>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => {
                console.log('[Razorpay] Dialog cancelled by user');
                setLoading(false);
                onOpenChange(false);
              }}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              onClick={handlePayment}
              disabled={loading || !razorpayLoaded || !config?.enabled || configLoading || !!configError || enteredAmount < 1}
              className="w-full sm:w-auto"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <CreditCard className="h-4 w-4 mr-2" />
                  Pay ₹{totalToPay.toFixed(2)}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* GST Billing Details Dialog */}
      {gstInvoiceData && (
        <GstBillingDetailsDialog
          open={showGstDialog}
          onOpenChange={setShowGstDialog}
          transactionId={gstInvoiceData.transactionId}
          creditAmount={gstInvoiceData.creditAmount}
          invoiceNumber={gstInvoiceData.invoiceNumber}
        />
      )}
    </>
  );
}
