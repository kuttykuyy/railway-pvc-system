'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';
import dynamic from 'next/dynamic';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowRight, Loader2 } from 'lucide-react';
import Link from 'next/link';
// The strength meter pulls in zxcvbn (~400 kB dictionary); load it on the client
// on demand so it stays out of this public page's initial JS.
const PasswordStrengthIndicator = dynamic(
  () => import('@/components/password-strength-indicator').then(m => m.PasswordStrengthIndicator),
  { ssr: false },
);
import { validatePhoneNumber } from '@/lib/phone-validation';
import { TurnstileWidget } from '@/components/ui/turnstile-widget';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getRailwayZoneOptions } from '@/lib/zone-steel-city-mapping';
import { getOfficialRailwayEmailDomainHelp, isOfficialRailwayEmail } from '@/lib/official-email';
import { AuthShell, GoogleButton, OrDivider, ErrorBanner } from '@/components/auth/auth-shell';

const inputCls = 'h-11 px-3.5 bg-gray-50 border-gray-200 focus:bg-white transition-colors';

/**
 * Sign-up, cut to what the server actually needs: name, WhatsApp, email, password.
 *
 * Google first, because it is one click and no fields. The account-type tiles are
 * gone from the main path — almost everyone is a contractor — and department staff
 * open that section from one link, where the zone and the railnet-email rule appear
 * only for them. The referral code is a link too (opened automatically when the URL
 * carries ?ref=). Same handlers and same request body as before; only the shape
 * of the page changed.
 */
export function SignUpForm() {
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  // Two kinds of department user: the executive (engineering) side that approves the
  // work, and the accounts/audit office that vets the proposal afterwards.
  const [accountType, setAccountType] = useState<'contractor' | 'railway_official' | 'accounts_official'>('contractor');
  const [railwayZone, setRailwayZone] = useState('');
  const [referralCode, setReferralCode] = useState('');
  /** The two folded-away sections. */
  const [officialOpen, setOfficialOpen] = useState(false);
  const [referralOpen, setReferralOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  /** Turnstile's proof this is a person. Empty until the check passes, and again once
   *  it expires. Stays empty when Turnstile is not configured, which the server allows. */
  const [turnstileToken, setTurnstileToken] = useState('');
  const [turnstileReset, setTurnstileReset] = useState(0);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [passwordValidation, setPasswordValidation] = useState<{
    isValid: boolean;
    errors: string[];
    strength: 0 | 1 | 2 | 3 | 4;
    suggestions: string[];
    warning?: string;
  } | null>(null);

  const router = useRouter();
  const searchParams = useSearchParams();
  const tryBillDraftParam = searchParams?.get('tryBillDraft');
  const zoneOptions = getRailwayZoneOptions();
  const isDepartmentUser = accountType === 'railway_official' || accountType === 'accounts_official';

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('ref');
    if (code) {
      setReferralCode(code.toUpperCase());
      setReferralOpen(true);
    }
  }, []);

  const openOfficial = () => {
    setOfficialOpen(true);
    if (accountType === 'contractor') setAccountType('railway_official');
  };
  const closeOfficial = () => {
    setOfficialOpen(false);
    setAccountType('contractor');
    setRailwayZone('');
    setFieldErrors((prev) => ({ ...prev, railwayZone: '', email: '' }));
  };

  const handleGoogle = async () => {
    try {
      setLoading(true);
      setError('');
      // A brand-new account has nothing in it, so /contracts is an empty table and a
      // shrug. Send them to the two uploads that end in a real statement instead.
      await signIn('google', { callbackUrl: '/welcome', redirect: true });
    } catch {
      setError('Could not continue with Google. Please try again.');
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setFieldErrors({});

    if (!whatsappNumber || !whatsappNumber.trim()) {
      setFieldErrors({ whatsappNumber: 'WhatsApp number is required' });
      setLoading(false);
      return;
    }
    if (!validatePhoneNumber(whatsappNumber)) {
      setFieldErrors({ whatsappNumber: 'Invalid format. Use: +[country code][number] (e.g., +919876543210)' });
      setLoading(false);
      return;
    }
    if (isDepartmentUser && !railwayZone) {
      setFieldErrors({ railwayZone: 'Railway zone is required for department users' });
      setLoading(false);
      return;
    }
    if (isDepartmentUser && !isOfficialRailwayEmail(email)) {
      setFieldErrors({ email: `Use an official railway email ending in ${getOfficialRailwayEmailDomainHelp()}` });
      setLoading(false);
      return;
    }

    if (passwordValidation && !passwordValidation.isValid) {
      setError('Please fix the password requirements before continuing');
      setLoading(false);
      return;
    }
    if (passwordValidation && passwordValidation.strength < 2) {
      setError('Password is too weak. Please use a stronger password');
      setLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, fullName, whatsappNumber, accountType, railwayZone, referralCode, turnstileToken }),
      });
      const data = await response.json();

      if (response.ok) {
        if (data.requiresVerification) {
          const verifyUrl = new URL('/auth/verify-notice', window.location.origin);
          verifyUrl.searchParams.set('email', email);
          // The verification email failed to send — tell the notice page so it prompts
          // a resend instead of asking the user to check an inbox with nothing in it.
          if (data.emailSent === false) {
            verifyUrl.searchParams.set('sent', '0');
          }
          if (tryBillDraftParam?.startsWith('local:')) {
            verifyUrl.searchParams.set('tryBillDraft', tryBillDraftParam);
          }
          router.push(verifyUrl.toString());
          return;
        }

        // Sign in so the claim call is authenticated
        const signInResult = await signIn('credentials', {
          email,
          password,
          redirect: false,
        });

        if (signInResult?.error || !signInResult?.ok) {
          const signinUrl = new URL('/auth/signin', window.location.origin);
          signinUrl.searchParams.set('registered', 'true');
          signinUrl.searchParams.set('email', email);
          if (tryBillDraftParam?.startsWith('local:')) {
            signinUrl.searchParams.set('tryBillDraft', tryBillDraftParam);
          }
          router.push(signinUrl.toString());
          return;
        }

        if (tryBillDraftParam?.startsWith('local:')) {
          try {
            const draftJson = decodeURIComponent(tryBillDraftParam.slice(6));
            const draft = JSON.parse(draftJson);
            const claimRes = await fetch('/api/try-bill/claim', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ draft }),
            });

            if (claimRes.ok) {
              const { billId } = await claimRes.json();
              localStorage.removeItem('irpvc_guest_draft');
              router.push(`/bills/${billId}`);
              return;
            }
          } catch (claimError) {
            console.error('Failed to claim try-bill draft:', claimError);
          }
        }

        // A brand-new account has nothing in it, so /contracts is an empty table and a
        // shrug. Send them to the two uploads that end in a real statement instead.
        router.push('/welcome');
      } else {
        setError(data.error || 'An error occurred during signup');
        // Cloudflare retires a token the moment it is checked, so the one just sent is
        // spent whatever the reason for the refusal. Without a fresh challenge the next
        // attempt would be rejected for the check rather than for the real problem.
        setTurnstileToken('');
        setTurnstileReset((n) => n + 1);
      }
    } catch {
      setError('An error occurred. Please try again.');
      setTurnstileToken('');
      setTurnstileReset((n) => n + 1);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell title="Create your free account" subtitle="Four details. Your first bill is on us.">
      <div className="space-y-5">
        {error && <ErrorBanner>{error}</ErrorBanner>}

        <GoogleButton onClick={handleGoogle} disabled={loading} label="Continue with Google" />
        <OrDivider>or with email</OrDivider>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="fullName" className="text-sm font-semibold text-gray-700">Full name</Label>
              <Input
                id="fullName"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                autoComplete="name"
                placeholder="Ramesh Kumar"
                className={inputCls}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="whatsappNumber" className="text-sm font-semibold text-gray-700">WhatsApp number</Label>
              <Input
                id="whatsappNumber"
                type="tel"
                value={whatsappNumber}
                onChange={(e) => { setWhatsappNumber(e.target.value); setFieldErrors((prev) => ({ ...prev, whatsappNumber: '' })); }}
                required
                autoComplete="tel"
                placeholder="+919876543210"
                className={`${inputCls} ${fieldErrors.whatsappNumber ? 'border-red-500' : ''}`}
              />
              {fieldErrors.whatsappNumber && <p className="text-sm text-red-600">{fieldErrors.whatsappNumber}</p>}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-sm font-semibold text-gray-700">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setFieldErrors((prev) => ({ ...prev, email: '' })); }}
              required
              autoComplete="email"
              placeholder={isDepartmentUser ? 'name@sr.railnet.gov.in' : 'you@example.com'}
              className={`${inputCls} ${fieldErrors.email ? 'border-red-500' : ''}`}
            />
            {isDepartmentUser && (
              <p className="text-xs text-gray-500">
                Department users must use an official railway email ending in {getOfficialRailwayEmailDomainHelp()}.
                Admin approval is required after email verification.
              </p>
            )}
            {fieldErrors.email && <p className="text-sm text-red-600">{fieldErrors.email}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-sm font-semibold text-gray-700">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
              placeholder="Choose a strong password"
              className={inputCls}
            />
            <PasswordStrengthIndicator password={password} onValidationChange={setPasswordValidation} />
          </div>

          {/* Department staff: which office, and which zone. Folded away because almost
              everyone signing up is a contractor, and three tiles at the top of the form
              were the first thing every one of them had to read past. */}
          {officialOpen && (
            <div className="space-y-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-gray-800">Railway department account</p>
                  <p className="text-xs text-gray-500 mt-0.5">Free for department staff. Approved by an admin after email verification.</p>
                </div>
                <button type="button" onClick={closeOfficial} className="text-xs font-semibold text-gray-500 hover:text-gray-700">I&rsquo;m a contractor</button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setAccountType('railway_official')}
                  className={`rounded-lg border p-3 text-center text-sm transition-colors ${
                    accountType === 'railway_official'
                      ? 'border-emerald-600 bg-emerald-50/60 text-emerald-800 font-semibold'
                      : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                  }`}
                >
                  <span className="block">Executive</span>
                  <span className="block text-[11px] font-normal opacity-75">approves the bill</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAccountType('accounts_official')}
                  className={`rounded-lg border p-3 text-center text-sm transition-colors ${
                    accountType === 'accounts_official'
                      ? 'border-emerald-600 bg-emerald-50/60 text-emerald-800 font-semibold'
                      : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                  }`}
                >
                  <span className="block">Accounts / Audit</span>
                  <span className="block text-[11px] font-normal opacity-75">passes it for payment</span>
                </button>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="railwayZone" className="text-sm font-semibold text-gray-700">Railway zone</Label>
                <Select
                  value={railwayZone}
                  onValueChange={(value) => { setRailwayZone(value); setFieldErrors((prev) => ({ ...prev, railwayZone: '' })); }}
                >
                  <SelectTrigger id="railwayZone" className="h-11 bg-white border-gray-200 text-left">
                    <SelectValue placeholder="Select your railway zone" />
                  </SelectTrigger>
                  <SelectContent>
                    {zoneOptions.map((zone) => (
                      <SelectItem key={zone.value} value={zone.value}>{zone.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {fieldErrors.railwayZone && <p className="text-sm text-red-600">{fieldErrors.railwayZone}</p>}
              </div>
            </div>
          )}

          {referralOpen && (
            <div className="space-y-1.5">
              <Label htmlFor="referralCode" className="text-sm font-semibold text-gray-700">
                Referral code <span className="font-normal text-gray-400">(optional)</span>
              </Label>
              <Input
                id="referralCode"
                type="text"
                value={referralCode}
                onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                placeholder="IRXXXXXXXXXX"
                className={`${inputCls} uppercase`}
                maxLength={16}
              />
              <p className="text-xs text-gray-500">After your first qualifying Rs. 1,000 top-up, both accounts receive Rs. 199 credit.</p>
            </div>
          )}

          <TurnstileWidget onToken={setTurnstileToken} resetSignal={turnstileReset} />

          <Button
            type="submit"
            className="w-full h-12 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-[15px] shadow-[0_8px_20px_-8px_rgba(5,150,105,0.5)]"
            disabled={loading}
          >
            {loading ? (
              <span className="flex items-center gap-2"><Loader2 className="h-5 w-5 animate-spin" />Creating account…</span>
            ) : (
              <span className="flex items-center gap-2">Create free account<ArrowRight className="h-[18px] w-[18px]" /></span>
            )}
          </Button>

          <div className="space-y-2 text-[13px] leading-[18px] text-gray-500">
            {!officialOpen && (
              <p>
                Railway official or accounts staff?{' '}
                <button type="button" onClick={openOfficial} className="font-semibold text-emerald-700 hover:text-emerald-800">
                  Sign up with your railnet email &rarr;
                </button>
              </p>
            )}
            {!referralOpen && (
              <p>
                Have a referral code?{' '}
                <button type="button" onClick={() => setReferralOpen(true)} className="font-semibold text-emerald-700 hover:text-emerald-800">
                  Enter it
                </button>
              </p>
            )}
          </div>
        </form>

        <div className="h-px bg-gray-200" />

        <div className="space-y-2.5 text-center">
          <p className="text-sm text-gray-600">
            Already have an account?{' '}
            <Link href="/auth/signin" className="font-semibold text-emerald-700 hover:text-emerald-800">Sign in</Link>
          </p>
          <p className="text-xs leading-[18px] text-gray-400">
            By creating an account you agree to the{' '}
            <Link href="/terms" className="text-gray-500 hover:text-gray-700">Terms</Link> and{' '}
            <Link href="/privacy" className="text-gray-500 hover:text-gray-700">Privacy Policy</Link>.
          </p>
        </div>
      </div>
    </AuthShell>
  );
}
