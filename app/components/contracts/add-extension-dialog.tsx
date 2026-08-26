'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'react-hot-toast';
import { Loader2 } from 'lucide-react';

/**
 * Record a time extension without leaving the bill you were creating.
 *
 * A bill measured past the contract's completion date is blocked until the extension is
 * on file — the right rule, but bouncing to a separate screen mid-import and back is
 * friction. This is the same POST the extensions page makes, in a dialog, so the
 * blocked flow can add the extension and retry in place.
 *
 * It does NOT weaken the block: the server still refuses the bill until an extension
 * actually covers its date. This only removes the trip.
 */

/** 17A leaves PVC alone; 17B caps the indices at the original completion month. */
type ExtensionType = '17A' | '17B';

export interface ExtensionRequired {
  contractId: string;
  /** Where the extension starts from — the contract's current/original completion date. */
  originalCompletionDate: string | Date | null;
  /** The date the batch needs the extension to reach, so a good default can be offered. */
  neededUntil?: string | Date | null;
  coveredUntil?: string | Date | null;
}

const toDateInput = (d: string | Date | null | undefined): string => {
  if (!d) return '';
  const date = new Date(d);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
};

export function AddExtensionDialog({
  open,
  onOpenChange,
  info,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  info: ExtensionRequired | null;
  /** Called after the extension is recorded, so the caller can retry the bill. */
  onSaved: () => void;
}) {
  const [extensionType, setExtensionType] = useState<ExtensionType>('17B');
  const [originalDate, setOriginalDate] = useState('');
  const [extendedDate, setExtendedDate] = useState('');
  const [orderNumber, setOrderNumber] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [seeded, setSeeded] = useState<string | null>(null);

  // Seed the dates from the block once per contract the dialog opens for. The extended
  // date defaults to what the batch needs, which is the whole point — clear every
  // blocked bill with one extension.
  if (open && info && seeded !== info.contractId) {
    setOriginalDate(toDateInput(info.originalCompletionDate));
    setExtendedDate(toDateInput(info.neededUntil) || toDateInput(info.coveredUntil));
    setSeeded(info.contractId);
  }

  const save = async () => {
    if (!info) return;
    if (!originalDate || !extendedDate) {
      toast.error('Both the original and the extended completion date are needed.');
      return;
    }
    if (new Date(extendedDate) < new Date(originalDate)) {
      toast.error('The extended date cannot be before the original.');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/contracts/${info.contractId}/extensions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          extensionType,
          originalCompletionDate: originalDate,
          extendedCompletionDate: extendedDate,
          orderNumber: orderNumber.trim() || null,
          extensionReason: reason.trim() || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not record the extension.');
      toast.success('Extension recorded. You can create the bill now.');
      setSeeded(null);
      onOpenChange(false);
      onSaved();
    } catch (e: any) {
      toast.error(e.message, { duration: 8000 });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Record the time extension</DialogTitle>
          <DialogDescription>
            The bill runs past the contract&apos;s completion date. Enter the granted extension and
            the bill can be created — no need to leave this screen.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Extension type</Label>
            <div className="flex gap-2">
              {(['17A', '17B'] as const).map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setExtensionType(t)}
                  className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium ${
                    extensionType === t ? 'border-emerald-400 bg-emerald-50 text-emerald-800' : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {t}
                  <span className="mt-0.5 block text-[11px] font-normal text-slate-500">
                    {t === '17A' ? 'PVC unaffected' : 'PVC indices capped'}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="origDate">Original completion</Label>
              <Input id="origDate" type="date" value={originalDate} onChange={e => setOriginalDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="extDate">Extended to</Label>
              <Input id="extDate" type="date" value={extendedDate} onChange={e => setExtendedDate(e.target.value)} />
            </div>
          </div>
          {info?.neededUntil && (
            <p className="text-[11px] text-slate-500">
              Must reach at least {toDateInput(info.neededUntil)} to cover the bill(s) you are creating.
            </p>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="ordNo">Extension order number <span className="text-slate-400">(optional)</span></Label>
            <Input id="ordNo" value={orderNumber} onChange={e => setOrderNumber(e.target.value)} placeholder="e.g. EE/GNT/2025/17B/012" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reason">Reason <span className="text-slate-400">(optional)</span></Label>
            <Input id="reason" value={reason} onChange={e => setReason(e.target.value)} placeholder="Why the extension was granted" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving}>
            {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</> : 'Record extension'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
