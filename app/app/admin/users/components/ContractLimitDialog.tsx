'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FolderOpen, Info } from 'lucide-react';
import type { User } from '../types';

interface ContractLimitDialogProps {
  user: User | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (userId: string, contractLimitOverride: number | null) => Promise<void>;
}

export function ContractLimitDialog({ user, open, onOpenChange, onSubmit }: ContractLimitDialogProps) {
  const [value, setValue] = useState('');
  const [useOverride, setUseOverride] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (user) {
      if (user.contractLimitOverride !== null && user.contractLimitOverride !== undefined) {
        setUseOverride(true);
        setValue(String(user.contractLimitOverride));
      } else {
        setUseOverride(false);
        setValue('');
      }
    }
  }, [user]);

  const handleSubmit = async () => {
    if (!user) return;
    setSubmitting(true);
    try {
      let override: number | null = null;
      if (useOverride) {
        const n = parseInt(value, 10);
        if (isNaN(n) || n < 0) return;
        override = n;
      }
      await onSubmit(user.id, override);
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  if (!user) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderOpen className="h-5 w-5 text-emerald-600" />
            Contract Limit — {user.name || user.email}
          </DialogTitle>
          <DialogDescription>
            Set a custom contract limit for this Railway Official. Overrides the global default.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-4">
          {/* Toggle override */}
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="use-override"
              checked={useOverride}
              onChange={e => setUseOverride(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-emerald-600"
            />
            <Label htmlFor="use-override" className="text-sm font-medium cursor-pointer">
              Set a custom limit for this user
            </Label>
          </div>

          {useOverride && (
            <div className="space-y-2 pl-7">
              <Label htmlFor="limit-value" className="text-sm font-semibold text-slate-700">
                Contract limit
              </Label>
              <div className="flex items-center gap-3">
                <Input
                  id="limit-value"
                  type="number"
                  min="0"
                  value={value}
                  onChange={e => setValue(e.target.value)}
                  className="w-28 rounded-lg"
                  placeholder="e.g. 10"
                  autoFocus
                />
                <span className="text-sm text-slate-500">contracts total (0 = unlimited)</span>
              </div>
            </div>
          )}

          <div className="flex items-start gap-2 rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 text-xs text-slate-600">
            <Info className="h-3.5 w-3.5 mt-0.5 shrink-0 text-slate-400" />
            <span>
              {useOverride
                ? 'This user will use the custom limit above instead of the global default.'
                : 'This user currently uses the global default limit set in Railway Official Settings.'}
            </span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
