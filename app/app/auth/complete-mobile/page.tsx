'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { validatePhoneNumber } from '@/lib/phone-validation';
import { Loader2, Phone } from 'lucide-react';

export default function CompleteMobilePage() {
  const router = useRouter();
  const { update } = useSession();
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!whatsappNumber.trim()) {
      setError('Mobile number is required');
      return;
    }
    if (!validatePhoneNumber(whatsappNumber)) {
      setError('Invalid format. Use +[country code][number] (e.g. +919876543210)');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/user/complete-mobile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ whatsappNumber: whatsappNumber.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Could not save your mobile number.');
        return;
      }
      // Refresh the session token so it now records that the user has a phone,
      // then continue into the app.
      await update();
      router.push('/contracts');
      router.refresh();
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-indigo-100 text-indigo-600">
          <Phone className="h-5 w-5" />
        </div>
        <h1 className="text-xl font-bold text-slate-900">One quick step</h1>
        <p className="mt-1 text-sm text-slate-600">
          Please add your mobile (WhatsApp) number to continue. We use it to send your PVC statements and important updates.
        </p>

        <form onSubmit={handleSubmit} className="mt-5 space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="whatsappNumber" className="text-sm font-semibold text-slate-700">
              Mobile / WhatsApp Number <span className="text-red-500">*</span>
            </Label>
            <Input
              id="whatsappNumber"
              type="tel"
              value={whatsappNumber}
              onChange={(e) => setWhatsappNumber(e.target.value)}
              placeholder="+919876543210"
              className={error ? 'border-red-500' : ''}
              required
              autoFocus
            />
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>

          <Button type="submit" disabled={saving} className="w-full">
            {saving ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…</>) : 'Save and continue'}
          </Button>
        </form>

        <button
          type="button"
          onClick={() => signOut({ callbackUrl: '/auth/signin' })}
          className="mt-4 w-full text-center text-xs text-slate-400 hover:text-slate-600"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
