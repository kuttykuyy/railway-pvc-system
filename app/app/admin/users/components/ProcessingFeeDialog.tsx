
/**
 * Processing Fee Dialog Component
 */

'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { IndianRupee } from 'lucide-react';
import type { User, ProcessingFeeFormData } from '../types';

interface ProcessingFeeDialogProps {
  user: User | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (formData: ProcessingFeeFormData) => Promise<void>;
}

export function ProcessingFeeDialog({ user, open, onOpenChange, onSubmit }: ProcessingFeeDialogProps) {
  const [formData, setFormData] = useState<ProcessingFeeFormData>({
    isFreeAccount: false,
    customProcessingFee: ''
  });
  const [submitting, setSubmitting] = useState(false);

  // Update form when user changes
  useEffect(() => {
    if (user) {
      setFormData({
        isFreeAccount: user.isFreeAccount,
        customProcessingFee: user.customProcessingFee?.toString() || ''
      });
    }
  }, [user]);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await onSubmit(formData);
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
            <IndianRupee className="h-5 w-5" />
            Processing Fee Settings
          </DialogTitle>
          <DialogDescription>
            {user.name || user.email}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="flex items-center justify-between space-x-2">
            <div className="space-y-0.5">
              <Label htmlFor="free-account">Free Account</Label>
              <p className="text-sm text-muted-foreground">
                User will not be charged for bill processing
              </p>
            </div>
            <Switch
              id="free-account"
              checked={formData.isFreeAccount}
              onCheckedChange={(checked) => setFormData({ ...formData, isFreeAccount: checked })}
            />
          </div>

          {!formData.isFreeAccount && (
            <div className="space-y-2">
              <Label htmlFor="custom-fee">Custom Processing Fee (₹)</Label>
              <Input
                id="custom-fee"
                type="number"
                step="0.01"
                placeholder="Leave empty for default fee"
                value={formData.customProcessingFee}
                onChange={(e) => setFormData({ ...formData, customProcessingFee: e.target.value })}
              />
              <p className="text-sm text-muted-foreground">
                Enter a custom processing fee or leave empty to use the default fee
              </p>
            </div>
          )}
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
            {submitting ? 'Saving...' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
