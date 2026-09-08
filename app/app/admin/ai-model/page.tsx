'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { toast } from 'react-hot-toast';
import { Cpu, Info } from 'lucide-react';

interface Setting {
  key: string;
  value: string;
  dataType: string;
}

// The models offered as quick picks. Any other name your Abacus (RouteLLM) account
// exposes can still be typed in the box.
const PRESETS = [
  { value: 'gemini-3.8-flash', label: 'Gemini Flash (gemini-3.8-flash)' },
  { value: 'route-llm', label: 'Abacus auto-router (route-llm)' },
  { value: 'gpt-4.1', label: 'GPT-4.1 (gpt-4.1)' },
];

/**
 * Which AI model reads uploaded LOAs, agreements and bills. Changing it here writes the
 * AI_MODEL admin setting — no environment variable and no redeploy. The name must be one
 * your Abacus (RouteLLM) account actually exposes, or reads will error.
 */
export default function AiModelSettingsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [model, setModel] = useState('gemini-3.8-flash');

  useEffect(() => {
    fetch('/api/admin/settings')
      .then(r => { if (r.status === 403) { router.push('/dashboard'); return null; } return r.json(); })
      .then((settings: Setting[] | null) => {
        if (!settings) return;
        const s = settings.find(x => x.key === 'AI_MODEL');
        if (s && s.value.trim()) setModel(s.value.trim());
      })
      .catch(() => toast.error('Failed to load settings'))
      .finally(() => setLoading(false));
  }, [router]);

  const save = async () => {
    const value = model.trim();
    if (!value) { toast.error('Enter a model name'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: [{ key: 'AI_MODEL', value, dataType: 'string' }] }),
      });
      if (!res.ok) throw new Error('Failed to save');
      toast.success(`AI model set to ${value}`);
    } catch {
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
        <div className="rounded-xl bg-emerald-100 p-2.5"><Cpu className="h-6 w-6 text-emerald-700" /></div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">AI model</h1>
          <p className="text-sm text-slate-500">Which model reads uploaded LOAs, agreements and bills</p>
        </div>
      </div>

      <Card className="rounded-2xl border-slate-200 shadow-sm">
        <CardHeader className="border-b border-slate-100 pb-4">
          <CardTitle className="text-base">Reading model</CardTitle>
          <CardDescription>
            Every PDF read goes to this model through Abacus (RouteLLM). Change it here — no
            environment variable and no redeploy needed.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5 pt-6">
          <div className="flex flex-wrap gap-2">
            {PRESETS.map(p => (
              <button
                key={p.value}
                type="button"
                onClick={() => setModel(p.value)}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                  model.trim() === p.value
                    ? 'border-emerald-400 bg-emerald-50 text-emerald-800'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="model" className="text-sm font-semibold text-slate-800">Model name</Label>
            <input
              id="model"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              spellCheck={false}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-mono focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
              placeholder="gemini-3.8-flash"
            />
          </div>

          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save model'}
          </button>

          <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 text-sm text-slate-600">
            <p className="flex items-center gap-1.5 font-semibold text-slate-800 mb-1"><Info className="h-4 w-4" /> Good to know</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>The name must be one your Abacus (RouteLLM) account exposes, or reads will error.</li>
              <li><strong>route-llm</strong> lets Abacus pick the model for each request.</li>
              <li>Check the <strong>AI status</strong> after changing it — a bad name shows up there.</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
