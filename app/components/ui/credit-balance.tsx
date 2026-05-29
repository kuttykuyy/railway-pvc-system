
'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { RazorpayTopupDialog } from '@/components/ui/razorpay-topup-dialog';
import { 
  CreditCard, 
  AlertTriangle, 
  Info, 
  Gift,
  Check,
  Star,
  Phone,
  User
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface CreditBalance {
  balance: number;
  nextBillCost: number;
  canAffordNextBill: boolean;
  showLowCreditWarning: boolean;
  paymentProcessingEnabled: boolean;
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
  message?: string;
}

export default function CreditBalance() {
  const { data: session, status } = useSession();
  const [creditData, setCreditData] = useState<CreditBalance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showTopupDialog, setShowTopupDialog] = useState(false);

  useEffect(() => {
    const fetchCreditBalance = async () => {
      if (status !== 'authenticated') return;
      
      try {
        const response = await fetch('/api/credits/balance');
        if (!response.ok) {
          throw new Error('Failed to fetch credit balance');
        }
        
        const data: CreditBalance = await response.json();
        setCreditData(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load credit balance');
      } finally {
        setLoading(false);
      }
    };

    fetchCreditBalance();
  }, [status]);

  if (status === 'loading' || loading) {
    return (
      <Card className="w-full">
        <CardContent className="p-6">
          <div className="animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-1/3 mb-4"></div>
            <div className="h-8 bg-gray-200 rounded w-1/2 mb-2"></div>
            <div className="h-4 bg-gray-200 rounded w-2/3"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !creditData) {
    return (
      <Card className="w-full">
        <CardContent className="p-6">
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              {error || 'Unable to load credit balance'}
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  const { balance, nextBillCost, canAffordNextBill, showLowCreditWarning, trialInfo, accountInfo } = creditData;

  return (
    <Card className="w-full">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center space-x-2 text-base">
          {trialInfo.isActive ? (
            <>
              <Gift className="h-4 w-4 text-green-600" />
              <span>Account Balance</span>
            </>
          ) : (
            <>
              <CreditCard className="h-4 w-4 text-blue-600" />
              <span>Account Balance</span>
            </>
          )}
          <Badge 
            variant={accountInfo.status === 'active' ? 'default' : 'destructive'}
            className="ml-auto text-xs"
          >
            {accountInfo.tier}
          </Badge>
        </CardTitle>
      </CardHeader>
      
      <CardContent className="space-y-2 pt-0">
        {trialInfo.isActive ? (
          <div className="space-y-2">
            <div className="text-xl font-bold text-green-600">
              {trialInfo.billsRemaining} free {trialInfo.billsTotal === 1 ? 'bill' : 'bills'} left
            </div>
            <div className="text-xs text-gray-600">
              {trialInfo.billsUsed} of {trialInfo.billsTotal} trial {trialInfo.billsTotal === 1 ? 'bill' : 'bills'} used
            </div>

            {trialInfo.billsRemaining <= 1 && (
              <div className="bg-amber-50 border border-amber-200 p-3 rounded space-y-2">
                <div className="text-xs text-amber-800 font-medium">
                  {trialInfo.billsRemaining === 1 
                    ? `⚠️ Last free bill. Next: ₹${nextBillCost}`
                    : `⚠️ Trial ended. Next: ₹${nextBillCost}`
                  }
                </div>
                <Button size="sm" className="w-full" variant="default" onClick={() => setShowTopupDialog(true)}>
                  <CreditCard className="h-3 w-3 mr-1" />
                  Top-up via Razorpay
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <div className="text-xl font-bold text-blue-600">
              ₹{balance.toFixed(2)}
            </div>
            <div className="text-xs text-gray-600">Available balance</div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-600">Next bill cost:</span>
              <span className="font-medium">₹{nextBillCost.toFixed(2)}</span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-600">Bills this month:</span>
              <span className="font-medium">{accountInfo.monthlyBillCount}</span>
            </div>

            {(showLowCreditWarning || !canAffordNextBill) && (
              <div className="bg-red-50 border border-red-200 p-3 rounded space-y-2">
                <div className="text-xs text-red-800 font-medium">
                  {!canAffordNextBill 
                    ? "⚠️ Insufficient balance for next bill" 
                    : "⚠️ Low balance warning"
                  }
                </div>
                <Button size="sm" className="w-full" variant="default" onClick={() => setShowTopupDialog(true)}>
                  <CreditCard className="h-3 w-3 mr-1" />
                  Top-up via Razorpay
                </Button>
              </div>
            )}
          </div>
        )}

        <div className="pt-1 border-t">
          <div className={cn(
            "flex items-center space-x-1 text-xs",
            canAffordNextBill || trialInfo.billsRemaining > 0 
              ? "text-green-600" 
              : "text-red-600"
          )}>
            <div className={cn(
              "w-1.5 h-1.5 rounded-full",
              canAffordNextBill || trialInfo.billsRemaining > 0 
                ? "bg-green-500" 
                : "bg-red-500"
            )} />
            <span>
              {canAffordNextBill || trialInfo.billsRemaining > 0 
                ? "Ready to process bills" 
                : "Cannot process bills"
              }
            </span>
          </div>
        </div>
      </CardContent>

      <RazorpayTopupDialog
        open={showTopupDialog}
        onOpenChange={setShowTopupDialog}
        onSuccess={() => {
          // Refresh credit balance after successful top-up
          fetch('/api/credits/balance')
            .then(res => res.json())
            .then(data => setCreditData(data))
            .catch(err => console.error('Failed to refresh balance:', err));
        }}
      />
    </Card>
  );
}
