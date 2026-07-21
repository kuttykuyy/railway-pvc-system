
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

interface CreditTopupDialogProps {
  currentBalance: number;
  children?: React.ReactNode;
}

const MIN_TOPUP_AMOUNT = 1000;

export function CreditTopupDialog({ currentBalance, children }: CreditTopupDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [requestedAmount, setRequestedAmount] = useState('');
  const [message, setMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const amount = requestedAmount ? parseFloat(requestedAmount) : undefined;
      
      // Validate amount if provided
      if (amount !== undefined && (isNaN(amount) || amount < MIN_TOPUP_AMOUNT)) {
        toast.error(`Minimum top-up amount is ₹${MIN_TOPUP_AMOUNT.toLocaleString('en-IN')}`);
        setLoading(false);
        return;
      }

      const response = await fetch('/api/credits/request-topup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requestedAmount: amount,
          message: message.trim() || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to submit request');
      }

      toast.success('Credit top-up request submitted!', {
        description: 'Our team will contact you shortly at your registered email or WhatsApp.',
      });

      // Reset form and close dialog
      setRequestedAmount('');
      setMessage('');
      setOpen(false);
    } catch (error) {
      console.error('Error submitting credit top-up request:', error);
      toast.error('Failed to submit request', {
        description: error instanceof Error ? error.message : 'Please try again later',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children || (
          <Button variant="outline" size="sm">
            Request Credit Top-Up
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Request Credit Top-Up</DialogTitle>
            <DialogDescription>
              Fill out the form below and our team will contact you to process your credit top-up.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {/* Current Balance Display */}
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <div className="text-sm text-gray-600">Current Balance</div>
              <div className="text-2xl font-bold text-gray-900">
                ₹{currentBalance?.toLocaleString('en-IN') || '0'}
              </div>
            </div>

            {/* Requested Amount */}
            <div className="grid gap-2">
              <Label htmlFor="amount">
                Requested Amount (Optional)
                <span className="ml-1 text-xs text-gray-500">Leave empty if unsure</span>
              </Label>
              <Input
                id="amount"
                type="number"
                placeholder="e.g., 10000"
                value={requestedAmount}
                onChange={(e) => setRequestedAmount(e.target.value)}
                min={MIN_TOPUP_AMOUNT}
                step="500"
                disabled={loading}
              />
              <p className="text-xs text-gray-500">
                Minimum: ₹{MIN_TOPUP_AMOUNT.toLocaleString('en-IN')}. Enter the amount you'd like to add to your account
              </p>
            </div>

            {/* Message */}
            <div className="grid gap-2">
              <Label htmlFor="message">
                Message (Optional)
                <span className="ml-1 text-xs text-gray-500">Any specific requirements?</span>
              </Label>
              <Textarea
                id="message"
                placeholder="e.g., I need to process 20 bills this month..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={4}
                disabled={loading}
                maxLength={500}
              />
              <p className="text-xs text-gray-500">
                {message.length}/500 characters
              </p>
            </div>

            {/* Support Contact Info */}
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
              <div className="text-sm font-medium text-emerald-900 mb-1">
                📞 Contact Information
              </div>
              <div className="text-xs text-emerald-700 space-y-1">
                 <div>📧 Email: admin@illall.in</div>
                <div>💬 WhatsApp: +91 9944776689</div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Submit Request
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
