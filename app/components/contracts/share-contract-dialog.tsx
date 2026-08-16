'use client';

import { useEffect, useState } from 'react';
import { Share2, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

interface Share {
  id: string;
  canEdit: boolean;
  canCreateBills: boolean;
  grantedAt: string;
  user: { id: string; name: string | null; email: string };
}

/**
 * Sharing gives another account access to this contract and its bills. It does NOT move
 * ownership — the contract stays in this account and keeps appearing in this list. That
 * distinction is spelled out in the dialog because the two are easy to confuse and only
 * one of them is reversible with a click.
 */
export function ShareContractDialog({ contractId, agreementNo }: { contractId: string; agreementNo: string }) {
  const [open, setOpen] = useState(false);
  const [shares, setShares] = useState<Share[]>([]);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [canEdit, setCanEdit] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/contracts/${contractId}/share`);
      const data = await res.json();
      if (res.ok) setShares(data.shares || []);
      else toast.error(data.error || 'Could not load sharing');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (open) void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [open]);

  const share = async () => {
    if (!email.trim()) { toast.error('Enter the email address of the account to share with'); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/contracts/${contractId}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), canEdit, canCreateBills: true }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Could not share'); return; }
      toast.success(data.message || 'Shared');
      setEmail('');
      setCanEdit(false);
      await load();
    } catch {
      // A dropped connection or an HTML error page throws before any of the checks
      // above, and there was no catch — the button simply did nothing.
      toast.error('Could not share it. Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  const revoke = async (userId: string, who: string) => {
    try {
      const res = await fetch(`/api/contracts/${contractId}/share?userId=${userId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Could not remove access'); return; }
      toast.success(`Access removed for ${who}`);
      await load();
    } catch {
      toast.error(`Could not remove access for ${who}. Check your connection and try again.`);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50"
      >
        <Share2 className="h-4 w-4" /> Share
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Share {agreementNo}</DialogTitle>
            <DialogDescription>
              The other account will see this contract and its bills, and can download the statements.
              The contract stays yours — sharing does not move it out of your account.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <Label className="text-xs text-slate-600">Email address of the account</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void share(); }}
                placeholder="name@example.com"
                className="mt-1"
                disabled={saving}
              />
              <p className="mt-1 text-xs text-slate-500">
                They need an account already — there is no invitation email yet.
              </p>
            </div>

            <label className="flex items-start gap-2.5 text-sm cursor-pointer select-none">
              <input
                type="checkbox"
                checked={canEdit}
                onChange={(e) => setCanEdit(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-slate-800"
                disabled={saving}
              />
              <span>
                <span className="font-medium">Let them edit the contract</span>
                <span className="block text-xs text-slate-500">
                  They can add bills either way. Deleting is never shared — that stays with you.
                </span>
              </span>
            </label>

            <Button onClick={() => void share()} disabled={saving} className="w-full">
              {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Sharing…</> : 'Share'}
            </Button>
          </div>

          <div className="border-t border-slate-200 pt-3">
            <p className="text-xs font-medium text-slate-600 mb-2">Shared with</p>
            {loading ? (
              <p className="text-sm text-slate-400">Loading…</p>
            ) : shares.length === 0 ? (
              <p className="text-sm text-slate-400">Not shared with anyone yet.</p>
            ) : (
              <ul className="space-y-1.5">
                {shares.map(item => (
                  <li key={item.id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="min-w-0">
                      <span className="block truncate">{item.user.name || item.user.email}</span>
                      {item.user.name && <span className="block text-xs text-slate-500 truncate">{item.user.email}</span>}
                    </span>
                    <span className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-slate-500">{item.canEdit ? 'Can edit' : 'View only'}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                        onClick={() => void revoke(item.user.id, item.user.email)}
                        aria-label={`Remove access for ${item.user.email}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
