
/**
 * Credit Management Dialog Component
 */

'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CreditCard, Plus, Minus } from 'lucide-react';
import type { User, CreditFormData } from '../types';
import { formatCurrency } from '../utils/userUtils';

interface CreditDialogProps {
  user: User | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (formData: CreditFormData) => Promise<void>;
}

export function CreditDialog({ user, open, onOpenChange, onSubmit }: CreditDialogProps) {
  const [formData, setFormData] = useState<CreditFormData>({
    amount: '',
    type: 'add',
    reason: ''
  });
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await onSubmit(formData);
      // Reset form on success
      setFormData({ amount: '', type: 'add', reason: '' });
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  if (!user) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Manage Credits
          </DialogTitle>
          <DialogDescription>
            {user.name || user.email}
            {user.customerAccount && (
              <div className="mt-2 p-3 bg-muted rounded-md">
                <p className="text-sm font-medium">
                  Current Balance: {formatCurrency(user.customerAccount.creditBalance)}
                </p>
              </div>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="type">Transaction Type</Label>
            <Select 
              value={formData.type}
              onValueChange={(value: 'add' | 'deduct') => setFormData({ ...formData, type: value })}
            >
              <SelectTrigger id="type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="add">
                  <div className="flex items-center gap-2">
                    <Plus className="h-4 w-4" /> Add Credits
                  </div>
                </SelectItem>
                <SelectItem value="deduct">
                  <div className="flex items-center gap-2">
                    <Minus className="h-4 w-4" /> Deduct Credits
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="amount">Amount (₹)</Label>
            <Input
              id="amount"
              type="number"
              step="0.01"
              placeholder="0.00"
              value={formData.amount}
              onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="reason">Reason</Label>
            <Textarea
              id="reason"
              placeholder="Enter reason for this transaction..."
              value={formData.reason}
              onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button 
            variant="outline" 
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? 'Processing...' : 'Submit'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
