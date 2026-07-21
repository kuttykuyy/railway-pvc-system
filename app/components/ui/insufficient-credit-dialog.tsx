
'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { RazorpayTopupDialog } from '@/components/ui/razorpay-topup-dialog';
import { 
  CreditCard, 
  AlertTriangle, 
  Phone, 
  User,
  Mail,
  Clock,
  Copy,
  Check
} from 'lucide-react';

interface InsufficientCreditDialogProps {
  open: boolean;
  onClose: () => void;
  currentBalance: number;
  requiredAmount: number;
  shortfall?: number;
}

export function InsufficientCreditDialog({ 
  open, 
  onClose, 
  currentBalance, 
  requiredAmount,
  shortfall
}: InsufficientCreditDialogProps) {
  const [copiedPhone, setCopiedPhone] = useState(false);
  const [copiedEmail, setCopiedEmail] = useState(false);
  const [showTopupDialog, setShowTopupDialog] = useState(false);

  const actualShortfall = shortfall || (requiredAmount - currentBalance);

  const copyToClipboard = async (text: string, type: 'phone' | 'email') => {
    try {
      await navigator.clipboard.writeText(text);
      if (type === 'phone') {
        setCopiedPhone(true);
        setTimeout(() => setCopiedPhone(false), 2000);
      } else {
        setCopiedEmail(true);
        setTimeout(() => setCopiedEmail(false), 2000);
      }
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <>
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-red-100 rounded-full">
              <AlertTriangle className="h-6 w-6 text-red-600" />
            </div>
            <DialogTitle className="text-xl">Insufficient Credit Balance</DialogTitle>
          </div>
          <DialogDescription className="text-base">
            You don't have enough credits to process this bill. Please top up your account to continue.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Balance Information */}
          <Alert className="border-red-200 bg-red-50">
            <CreditCard className="h-4 w-4 text-red-600" />
            <AlertDescription className="ml-2">
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-700">Current Balance:</span>
                  <span className="font-semibold text-red-600">₹{currentBalance.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-700">Required Amount:</span>
                  <span className="font-semibold">₹{requiredAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between pt-1 border-t border-red-200">
                  <span className="text-gray-700 font-medium">Shortfall:</span>
                  <span className="font-bold text-red-600">₹{actualShortfall.toFixed(2)}</span>
                </div>
              </div>
            </AlertDescription>
          </Alert>

          {/* Top-up Action */}
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 space-y-3">
            <div className="text-sm text-emerald-900 font-medium">
              Top up your credits instantly via Razorpay to continue processing bills.
            </div>
            <Button 
              className="w-full" 
              onClick={() => {
                onClose();
                setShowTopupDialog(true);
              }}
            >
              <CreditCard className="h-4 w-4 mr-2" />
              Top-up Credits via Razorpay
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="w-full sm:w-auto">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <RazorpayTopupDialog
      open={showTopupDialog}
      onOpenChange={setShowTopupDialog}
      onSuccess={() => {
        window.location.reload();
      }}
    />
    </>
  );
}
