
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

const MIN_TOPUP_AMOUNT = 1000;

export function RazorpayTopupDialog({ 
  open, 
  onOpenChange,
  onSuccess 
}: RazorpayTopupDialogProps) {
  const [creditAmount, setCreditAmount] = useState<string>('1000');
  const [loading, setLoading] = useState(false);
  const [razorpayLoaded, setRazorpayLoaded] = useState(false);
  /** The checkout script never arrived — usually an ad-blocker or an office network. */
  const [razorpayBlocked, setRazorpayBlocked] = useState(false);
  const [config, setConfig] = useState<{ enabled: boolean; keyId: string | null } | null>(null);
  // Which gateway is live, from /api/payments/config. Razorpay unless an admin has
  // switched it, so an old cached answer or a failed fetch keeps today's behaviour.
  const [gateway, setGateway] = useState<'razorpay' | 'cashfree'>('razorpay');
  const [cashfreeMode, setCashfreeMode] = useState<'sandbox' | 'production'>('sandbox');
  
  // GST Invoice Dialog state
  const [showGstDialog, setShowGstDialog] = useState(false);
  const [gstInvoiceData, setGstInvoiceData] = useState<{
    transactionId: string;
    creditAmount: number;
    invoiceNumber: string;
  } | null>(null);

  const [configError, setConfigError] = useState<string | null>(null);
  const [configLoading, setConfigLoading] = useState(true);

  // Which gateway is taking money. Separate from the Razorpay-specific config below so a
  // Cashfree deployment does not depend on the Razorpay config call succeeding.
  useEffect(() => {
    if (!open) return;
    fetch('/api/payments/config')
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (!data) return;
        if (data.gateway === 'cashfree') {
          setGateway('cashfree');
          setCashfreeMode(data.mode === 'production' ? 'production' : 'sandbox');
        } else {
          setGateway('razorpay');
        }
      })
      .catch(() => { /* keep the Razorpay default */ });
  }, [open]);

  /**
   * Pay through Cashfree.
   *
   * The server opens the order and the SDK collects the money; the wallet is credited
   * only after /api/cashfree/verify asks Cashfree itself. So this function's job ends at
   * "ask the server to confirm" — it never decides a payment succeeded on its own, and
   * the modal closing without a clear result is not treated as a failure, because the
   * money may well be through and the webhook will catch it.
   */
  /**
   * Load Cashfree's browser SDK once, on demand, and hand back its factory.
   *
   * On demand rather than through next/script's onLoad, which does not reliably fire
   * for a tag mounted after the first render — and the Cashfree tag can only mount once
   * the gateway resolves, which is after a fetch. Depending on that onLoad is what left
   * the Pay button greyed for ever. Injecting the script here and awaiting its load has
   * no such timing hole.
   */
  const loadCashfreeSdk = (): Promise<any> => new Promise((resolve, reject) => {
    const w = window as any;
    if (w.Cashfree) { resolve(w.Cashfree); return; }
    const existing = document.getElementById('cashfree-sdk') as HTMLScriptElement | null;
    const onReady = () => {
      // The CDN global may be a factory function OR an object with .load — resolve on
      // either, and let the caller sort out which shape it got.
      if (w.Cashfree) resolve(w.Cashfree);
      else reject(new Error('The payment window failed to load. Please try again.'));
    };
    if (existing) { existing.addEventListener('load', onReady); existing.addEventListener('error', () => reject(new Error('Could not load the payment window.'))); return; }
    const script = document.createElement('script');
    script.id = 'cashfree-sdk';
    script.src = 'https://sdk.cashfree.com/js/v3/cashfree.js';
    script.async = true;
    script.onload = onReady;
    script.onerror = () => reject(new Error('Could not load the payment window. Check your connection and try again.'));
    document.body.appendChild(script);
  });

  const handleCashfreePayment = async () => {
    setLoading(true);
    try {
      const orderRes = await fetch('/api/cashfree/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ creditAmount: creditToReceive }),
      });
      const orderData = await orderRes.json().catch(() => ({}));
      if (!orderRes.ok) throw new Error(orderData.error || 'Could not start the payment.');

      // Load Cashfree's SDK on demand rather than through next/script's onLoad, which
      // does not reliably fire for a tag added after mount — and this tag only mounts
      // once the gateway resolves to cashfree, which is after the config fetch. That is
      // exactly why the Pay button used to sit greyed for ever.
      // Redirect to Cashfree's hosted checkout rather than opening its modal. The modal
      // (redirectTarget '_modal') did not open at all in testing — SDK-shape and popup
      // fragility that a full-page redirect simply does not have. The page navigates to
      // Cashfree, the customer pays, and Cashfree returns them to the order's returnUrl
      // (/profile?cf_order=...), where the return is verified. The webhook is the backstop
      // either way.
      const CF: any = await loadCashfreeSdk();
      const cashfree = typeof CF === 'function'
        ? CF({ mode: cashfreeMode })
        : (CF && typeof CF.load === 'function' ? await CF.load({ mode: cashfreeMode }) : null);
      if (!cashfree || typeof cashfree.checkout !== 'function') {
        throw new Error('The payment window could not start. Please try again.');
      }
      const result = await cashfree.checkout({
        paymentSessionId: orderData.paymentSessionId,
        redirectTarget: '_self',
      });
      // With '_self' the browser usually navigates away before this resolves. If it does
      // come back — some SDK versions resolve instead of navigating — surface any error
      // rather than leaving the button spinning.
      if (result?.error) {
        throw new Error(result.error.message || 'The payment could not be started.');
      }
    } catch (error: any) {
      toast.error(error?.message || 'The payment could not be completed.');
    } finally {
      setLoading(false);
    }
  };

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
      setCreditAmount('1000');
      setConfigError(null);
      fetchConfig();
    }
  }, [open]);

  const calculateTotalAmount = () => {
    const baseAmount = parseFloat(creditAmount) || 0;
    const gst = baseAmount * 0.18;
    const totalToPay = baseAmount + gst;

    return {
      baseAmount,
      gst,
      creditToReceive: baseAmount,
      totalToPay,
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

    if (!baseAmount || baseAmount <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    if (baseAmount < MIN_TOPUP_AMOUNT) {
      toast.error(`Minimum top-up amount is ₹${MIN_TOPUP_AMOUNT.toLocaleString('en-IN')}`);
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
        description: `Credit Top-up - ₹${baseAmount}`,
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
          creditAmount: baseAmount,
        },
        theme: {
          color: '#10b981',
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

  const { baseAmount, gst, creditToReceive, totalToPay } = calculateTotalAmount();

  return (
    <>
      <Script
        src="https://checkout.razorpay.com/v1/checkout.js"
        onLoad={() => setRazorpayLoaded(true)}
        onError={() => {
          console.error('Failed to load Razorpay');
          toast.error('Failed to load payment gateway');
          // Without this the toast was the only trace: razorpayLoaded stayed false, the
          // Pay button stayed greyed with no reason given, and reopening the dialog
          // could not help because next/script will not re-run onLoad.
          setRazorpayBlocked(true);
        }}
      />
      
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-emerald-600" />
              Credit Top-up{gateway === 'cashfree' ? ' via Cashfree' : ' via Razorpay'}
            </DialogTitle>
            <DialogDescription>
              Add credits to your account using {gateway === 'cashfree' ? 'Cashfree' : 'Razorpay'} — cards, UPI and net banking.
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

          {gateway === 'razorpay' && razorpayBlocked && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <p className="font-medium">The payment window could not load</p>
                <p className="mt-1">
                  Something on this network or browser is blocking checkout.razorpay.com —
                  usually an ad-blocker or an office firewall. Turn the blocker off for this
                  site, or try mobile data, then reload the page.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => window.location.reload()}
                >
                  Reload the page
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {gateway === 'razorpay' && configError && (
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

          {gateway === 'razorpay' && !configLoading && !configError && config && !config.enabled && (
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
                  min={MIN_TOPUP_AMOUNT}
                  step="1"
                  value={creditAmount}
                  onChange={(e) => setCreditAmount(e.target.value)}
                  className="pl-10"
                  placeholder="Enter amount"
                  disabled={loading || (gateway === 'razorpay' && !config?.enabled)}
                />
              </div>
              <p className="text-xs text-gray-500">
                Minimum: ₹{MIN_TOPUP_AMOUNT.toLocaleString('en-IN')} | Suggested: ₹1000, ₹2000, ₹5000, ₹10000
              </p>
            </div>

            {/* Price Breakdown */}
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-700">Base Amount:</span>
                <span className="font-medium">₹{baseAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-700">GST (18%):</span>
                <span className="font-medium">₹{gst.toFixed(2)}</span>
              </div>
              <div className="border-t border-emerald-300 pt-2 flex justify-between text-base font-semibold">
                <span className="text-gray-900">Total to Pay:</span>
                <span className="text-emerald-600">₹{totalToPay.toFixed(2)}</span>
              </div>
              <div className="border-t border-emerald-300 pt-2 flex justify-between text-base font-bold">
                <span className="text-green-700">Credits to Wallet:</span>
                <span className="text-green-600">₹{creditToReceive.toFixed(2)}</span>
              </div>
            </div>

            <Alert>
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-xs">
                After successful payment, ₹{creditToReceive.toFixed(2)} credits will be added to your wallet instantly.
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
              onClick={gateway === 'cashfree' ? handleCashfreePayment : handlePayment}
              disabled={
                loading || baseAmount < MIN_TOPUP_AMOUNT ||
                (gateway === 'cashfree'
                  ? false
                  : (!razorpayLoaded || !config?.enabled || configLoading || !!configError))
              }
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
