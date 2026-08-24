'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CheckCircle2, Loader2 } from 'lucide-react';

/**
 * A mobile number, and the proof that it belongs to whoever is typing it.
 *
 * The same field on the sign-up form and on the mandatory-mobile form, because both
 * write to the same column and the server now holds both to the same bar. Keeping one
 * component means the second one cannot quietly become the easier way in.
 *
 * When a code cannot be delivered — WhatsApp not configured — the server says so and
 * this renders as a plain number box. Demanding proof that cannot be sent would lock
 * everyone out of signing up.
 */

interface VerifyMobileProps {
  value: string;
  onChange: (value: string) => void;
  /** Told whether the CURRENT value has been proved. Goes false the moment it is edited. */
  onVerifiedChange: (verified: boolean) => void;
  label?: string;
  disabled?: boolean;
  error?: string;
}

export function VerifyMobile({
  value, onChange, onVerifiedChange, label = 'WhatsApp Number', disabled, error,
}: VerifyMobileProps) {
  const [required, setRequired] = useState<boolean | null>(null);
  const [sending, setSending] = useState(false);
  const [checking, setChecking] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [verified, setVerified] = useState(false);
  const [notice, setNotice] = useState('');
  const [problem, setProblem] = useState('');

  // Whether a code is needed at all is the server's call, not the browser's.
  useEffect(() => {
    fetch('/api/auth/send-otp')
      .then(response => response.json())
      .then(data => {
        setRequired(!!data.required);
        // Nothing to prove: report verified straight away so the form is not blocked.
        if (!data.required) onVerifiedChange(true);
      })
      .catch(() => { setRequired(false); onVerifiedChange(true); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Editing the number throws away the proof — it proved the OLD number. */
  const handleChange = (next: string) => {
    onChange(next);
    if (verified) { setVerified(false); onVerifiedChange(false); }
    if (sentTo && next.trim() !== sentTo) { setSentTo(null); setCode(''); }
    setProblem('');
    setNotice('');
  };

  const sendCode = async () => {
    setSending(true);
    setProblem('');
    setNotice('');
    try {
      const response = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: value.trim() }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) { setProblem(data.error || 'The code could not be sent.'); return; }
      setSentTo(value.trim());
      setNotice('Code sent on WhatsApp. It is good for 5 minutes.');
    } catch {
      setProblem('The code could not be sent. Check your connection and try again.');
    } finally {
      setSending(false);
    }
  };

  const checkCode = async () => {
    setChecking(true);
    setProblem('');
    try {
      const response = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: value.trim(), otp: code.trim() }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) { setProblem(data.error || 'That code was not right.'); return; }
      setVerified(true);
      onVerifiedChange(true);
      setNotice('');
    } catch {
      setProblem('The code could not be checked. Try again.');
    } finally {
      setChecking(false);
    }
  };

  const canSend = !disabled && !sending && value.trim().length >= 10;

  return (
    <div className="space-y-2">
      <Label htmlFor="whatsappNumber" className="text-sm font-semibold text-gray-700">
        {label} <span className="text-red-500">*</span>
      </Label>

      <div className="flex gap-2">
        <Input
          id="whatsappNumber"
          type="tel"
          value={value}
          onChange={event => handleChange(event.target.value)}
          required
          disabled={disabled || verified}
          placeholder="+919876543210"
          className={`h-11 px-4 bg-gray-50 border-gray-200 focus:bg-white transition-colors ${
            error ? 'border-red-500' : ''
          } ${verified ? 'border-emerald-300 bg-emerald-50/50' : ''}`}
        />
        {required && !verified && (
          <Button
            type="button"
            variant="outline"
            onClick={sendCode}
            disabled={!canSend}
            className="h-11 shrink-0 px-4"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : sentTo ? 'Resend' : 'Verify'}
          </Button>
        )}
      </div>

      {verified && (
        <p className="flex items-center gap-1.5 text-sm font-medium text-emerald-700">
          <CheckCircle2 className="h-4 w-4" /> Number verified
        </p>
      )}

      {required && !verified && sentTo && (
        <div className="flex gap-2">
          <Input
            value={code}
            onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric"
            placeholder="6-digit code"
            className="h-11 px-4 bg-gray-50 border-gray-200 tracking-widest"
          />
          <Button
            type="button"
            onClick={checkCode}
            disabled={checking || code.length !== 6}
            className="h-11 shrink-0 px-4"
          >
            {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirm'}
          </Button>
        </div>
      )}

      {notice && <p className="text-sm text-slate-600">{notice}</p>}
      {problem && <p className="text-sm text-red-600">{problem}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {required && !verified && !sentTo && (
        <p className="text-xs text-slate-500">
          We send a code to this number on WhatsApp. It is how your bills reach you, so it
          has to be a number you can receive messages on.
        </p>
      )}
    </div>
  );
}
