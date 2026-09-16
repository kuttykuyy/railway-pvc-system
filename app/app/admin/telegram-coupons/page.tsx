'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { toast } from 'react-hot-toast';
import { Ticket, Info } from 'lucide-react';

interface Setting {
  key: string;
  value: string;
  dataType: string;
}

/**
 * Waiver coupon codes for the Telegram bot's paid PVC report. Editing here writes the
 * TELEGRAM_REPORT_COUPONS admin setting — it takes effect at once, no redeploy. The
 * same-named environment variable still works too, and its codes are added to these.
 */
export default function TelegramCouponsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [codes, setCodes] = useState('');

  useEffect(() => {
    fetch('/api/admin/settings')
      .then((r) => { if (r.status === 403) { router.push('/dashboard'); return null; } return r.json(); })
      .then((settings: Setting[] | null) => {
        if (!settings) return;
        const s = settings.find((x) => x.key === 'TELEGRAM_REPORT_COUPONS');
        if (s) setCodes(s.value || '');
      })
      .catch(() => toast.error('Failed to load settings'))
      .finally(() => setLoading(false));
  }, [router]);

  const save = async () => {
    // Store one clean comma-separated line, whether they typed commas or newlines.
    const value = codes
      .split(/[\n,]+/)
      .map((c) => c.trim())
      .filter(Boolean)
      .join(',');
    setSaving(true);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: [{ key: 'TELEGRAM_REPORT_COUPONS', value, dataType: 'string' }] }),
      });
      if (!res.ok) throw new Error('Failed to save');
      setCodes(value);
      toast.success(value ? 'Coupon codes saved' : 'Coupons cleared');
    } catch {
      toast.error('Could not save the coupons');
    } finally {
      setSaving(false);
    }
  };

  const activeCount = codes.split(/[\n,]+/).map((c) => c.trim()).filter(Boolean).length;

  if (loading) {
    return (
      <div className="flex min-h-[300px] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6 flex items-center gap-3">
        <div className="rounded-xl bg-emerald-100 p-2.5"><Ticket className="h-6 w-6 text-emerald-700" /></div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Telegram coupons</h1>
          <p className="text-sm text-slate-500">Codes that waive the paid PVC report fee in the Telegram bot</p>
        </div>
      </div>

      <Card className="rounded-2xl border-slate-200 shadow-sm">
        <CardHeader className="border-b border-slate-100 pb-4">
          <CardTitle className="text-base">Waiver codes</CardTitle>
          <CardDescription>
            A user sends <strong>/coupon</strong> in the bot and types one of these to get the
            report free. Saved here they work at once — no redeploy.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5 pt-6">
          <div className="space-y-1.5">
            <Label htmlFor="codes" className="text-sm font-semibold text-slate-800">
              Codes <span className="font-normal text-slate-400">({activeCount} active)</span>
            </Label>
            <textarea
              id="codes"
              value={codes}
              onChange={(e) => setCodes(e.target.value)}
              spellCheck={false}
              rows={4}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-mono focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
              placeholder={'FREEPVC\nDIWALI2026:2026-12-31\nONEOFF:2026-12-31:1:1'}
            />
            <p className="text-xs text-slate-400">One code per line (or comma-separated). Case doesn&apos;t matter.</p>
          </div>

          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save codes'}
          </button>

          <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 text-sm text-slate-600">
            <p className="flex items-center gap-1.5 font-semibold text-slate-800 mb-1"><Info className="h-4 w-4" /> Code formats</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><span className="font-mono">FREEPVC</span> — works until you remove it.</li>
              <li><span className="font-mono">FREEPVC:2026-12-31</span> — stops working after that date.</li>
              <li><span className="font-mono">FREEPVC:2026-12-31:5</span> — at most 5 reports per chat.</li>
              <li><span className="font-mono">FREEPVC:2026-12-31:5:50</span> — also at most 50 across all chats.</li>
            </ul>
            <p className="mt-2 text-xs text-slate-500">
              Defaults when a cap is left off: 10 per chat, 25 in total. Leave the box empty to turn coupons off
              (any codes set in the environment variable still apply).
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
