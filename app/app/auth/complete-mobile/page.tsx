'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { signOutToCurrentSite } from '@/lib/sign-out';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { validatePhoneNumber } from '@/lib/phone-validation';
import { VerifyMobile } from '@/components/auth/verify-mobile';
import { Loader2, Phone } from 'lucide-react';

export default function CompleteMobilePage() {
  const router = useRouter();
  const { update } = useSession();
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Self-heal a stale session. The middleware sends people here on what the session
  // token says, and the token can lag the database: someone who just saved their number
  // still carries "no phone" and gets bounced back to this form, empty, on every page —
  // a loop with no way out. Ask the database directly; if the number is already there,
  // refresh the session and continue rather than asking for it again.
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/user/complete-mobile');
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.hasPhone) {
          await update().catch(() => {});
          window.location.href = '/welcome';
        }
      } catch {
        // The form below still works; this is only the shortcut past it.
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    if (!phoneVerified) {
      setError('Please verify the number first — tap Verify and enter the code sent by SMS.');
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
      // Refresh the session token so it now records that the user has a phone. The
      // refresh must not be able to strand them: the number IS saved, so even if the
      // refresh fails the mount check above will let them through on the next load.
      await update().catch(() => {});
      // A hard navigation, not a client-side push: the middleware must see the fresh
      // cookie, and this is the first-run path — new users belong on the two uploads,
      // not an empty contracts table.
      window.location.href = '/welcome';
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
          <Phone className="h-5 w-5" />
        </div>
        <h1 className="text-xl font-bold text-slate-900">One quick step</h1>
        <p className="mt-1 text-sm text-slate-600">
          Please add your mobile (WhatsApp) number to continue. We use it to send your PVC statements and important updates.
        </p>

        <form onSubmit={handleSubmit} className="mt-5 space-y-3">
          {/* The same field as sign-up, on purpose: this form writes to the same column
              and the server holds it to the same bar, so it must not become the easier
              way to claim a number. */}
          <VerifyMobile
            value={whatsappNumber}
            onChange={setWhatsappNumber}
            onVerifiedChange={setPhoneVerified}
            label="Mobile / WhatsApp Number"
            error={error}
          />

          <Button type="submit" disabled={saving || !phoneVerified} className="w-full">
            {saving ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…</>) : 'Save and continue'}
          </Button>
        </form>

        <button
          type="button"
          onClick={() => void signOutToCurrentSite()}
          className="mt-4 w-full text-center text-xs text-slate-400 hover:text-slate-600"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
