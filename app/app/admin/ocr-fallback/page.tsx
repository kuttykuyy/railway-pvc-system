'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { toast } from 'react-hot-toast';
import { ScanText, Info, AlertTriangle } from 'lucide-react';

interface Setting {
  key: string;
  value: string;
  dataType: string;
}

/**
 * The one switch behind the OCR fallback prototype. When on, a bill PDF with no readable
 * text (Print-to-PDF, screenshot, scan) is read from its page images instead of rejected;
 * the result is a draft the user must review. Off by default while accuracy and cost are
 * measured — flip it, upload a scanned bill, and watch the parse-failure log.
 */
export default function OcrFallbackSettingsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    fetch('/api/admin/settings')
      .then(r => { if (r.status === 403) { router.push('/dashboard'); return null; } return r.json(); })
      .then((settings: Setting[] | null) => {
        if (!settings) return;
        const s = settings.find(x => x.key === 'OCR_FALLBACK_ENABLED');
        if (s) setEnabled(s.value.toLowerCase() === 'true');
      })
      .catch(() => toast.error('Failed to load settings'))
      .finally(() => setLoading(false));
  }, [router]);

  const toggle = async (next: boolean) => {
    setEnabled(next);
    setSaving(true);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: [{ key: 'OCR_FALLBACK_ENABLED', value: String(next), dataType: 'boolean' }] }),
      });
      if (!res.ok) throw new Error('Failed to save');
      toast.success(next ? 'OCR fallback turned on' : 'OCR fallback turned off');
    } catch {
      setEnabled(!next);
      toast.error('Could not save the setting');
    } finally {
      setSaving(false);
    }
  };

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
        <div className="rounded-xl bg-emerald-100 p-2.5"><ScanText className="h-6 w-6 text-emerald-700" /></div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">OCR fallback (prototype)</h1>
          <p className="text-sm text-slate-500">Read bills that have no text layer by reading their page images</p>
        </div>
      </div>

      <Card className="rounded-2xl border-slate-200 shadow-sm">
        <CardHeader className="border-b border-slate-100 pb-4">
          <CardTitle className="text-base">Picture-read fallback</CardTitle>
          <CardDescription>
            When a bill PDF has no readable text (made with &ldquo;Print to PDF&rdquo;, a screenshot, or a scan),
            read the numbers off the page images with AI instead of rejecting it.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5 pt-6">
          <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 px-4 py-3">
            <div>
              <Label htmlFor="ocr" className="text-sm font-semibold text-slate-800">Enable OCR fallback</Label>
              <p className="text-xs text-slate-500 mt-0.5">Currently <strong>{enabled ? 'ON' : 'OFF'}</strong></p>
            </div>
            <Switch id="ocr" checked={enabled} onCheckedChange={toggle} disabled={saving} />
          </div>

          <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-900">
            <p className="flex items-center gap-1.5 font-semibold mb-1"><AlertTriangle className="h-4 w-4" /> It produces a draft, not a verified read</p>
            <p>A picture has no printed total to check against, so the app can only compare the read items to the
              bill&rsquo;s own Schedule Summary. Every OCR result is shown with a &ldquo;check every figure&rdquo; warning and must be reviewed before the bill is created.</p>
          </div>

          <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 text-sm text-slate-600">
            <p className="flex items-center gap-1.5 font-semibold text-slate-800 mb-1"><Info className="h-4 w-4" /> While testing</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Each OCR read costs an AI call — it&rsquo;s free to the user for now; pricing is decided after this trial.</li>
              <li>Every attempt is logged under <strong>Parse failures</strong> as &ldquo;RESCUED BY OCR&rdquo; with whether it reconciled — watch that to judge accuracy.</li>
              <li>Turn it off any time; bills with a real text layer are unaffected either way.</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
