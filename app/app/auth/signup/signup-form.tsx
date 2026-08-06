'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';
import dynamic from 'next/dynamic';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getRailwayZoneOptions } from '@/lib/zone-steel-city-mapping';
import { getOfficialRailwayEmailDomainHelp, isOfficialRailwayEmail } from '@/lib/official-email';

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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
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

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('ref');
    if (code) setReferralCode(code.toUpperCase());
  }, []);

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
    const isDepartmentUser = accountType === 'railway_official' || accountType === 'accounts_official';
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
        body: JSON.stringify({ email, password, fullName, whatsappNumber, accountType, railwayZone, referralCode }),
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

        router.push('/contracts');
      } else {
        setError(data.error || 'An error occurred during signup');
      }
    } catch {
      setError('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-grid-slate-200/50 [mask-image:linear-gradient(to_bottom,white,transparent)] pointer-events-none" />
      <div className="absolute top-20 left-10 w-72 h-72 bg-emerald-200/20 rounded-full blur-3xl animate-pulse" />
      <div className="absolute bottom-20 right-10 w-96 h-96 bg-emerald-200/20 rounded-full blur-3xl animate-pulse delay-1000" />

      <div className="w-full max-w-md mx-auto relative z-10">
        <Card className="w-full shadow-2xl border-0 bg-white/95 backdrop-blur-sm mt-12 mb-12">
          <CardHeader className="text-center pb-4 pt-8">
            <CardTitle className="text-2xl font-bold text-gray-900">
              Create Account
            </CardTitle>
            <CardDescription className="text-base text-gray-600 mt-2">
              Sign up for IR-PVC
            </CardDescription>
          </CardHeader>

          <CardContent className="px-8 pb-8">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm flex items-start space-x-2 mb-4">
                <svg className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="fullName" className="text-sm font-semibold text-gray-700">Full Name</Label>
                <Input
                  id="fullName"
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  placeholder="John Doe"
                  className="h-11 px-4 bg-gray-50 border-gray-200 focus:bg-white transition-colors"
                  autoFocus
                />
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-semibold text-gray-700">Account Type</Label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div
                    onClick={() => {
                      setAccountType('contractor');
                      setRailwayZone('');
                    }}
                    className={`cursor-pointer p-3 rounded-lg border text-center transition-all ${
                      accountType === 'contractor'
                        ? 'border-emerald-600 bg-emerald-50/50 text-emerald-700 font-semibold shadow-sm'
                        : 'border-gray-200 hover:border-gray-300 text-gray-600 bg-gray-50'
                    }`}
                  >
                    Contractor
                  </div>
                  <div
                    onClick={() => setAccountType('railway_official')}
                    className={`cursor-pointer p-3 rounded-lg border text-center transition-all ${
                      accountType === 'railway_official'
                        ? 'border-emerald-600 bg-emerald-50/50 text-emerald-700 font-semibold shadow-sm'
                        : 'border-gray-200 hover:border-gray-300 text-gray-600 bg-gray-50'
                    }`}
                  >
                    <span className="block">Executive</span>
                    <span className="block text-[11px] font-normal opacity-75">approves the bill</span>
                  </div>
                  {/* The accounts/audit office vets the proposal after the executive
                      approves it, and passes it for payment. */}
                  <div
                    onClick={() => setAccountType('accounts_official')}
                    className={`cursor-pointer p-3 rounded-lg border text-center transition-all ${
                      accountType === 'accounts_official'
                        ? 'border-emerald-600 bg-emerald-50/50 text-emerald-700 font-semibold shadow-sm'
                        : 'border-gray-200 hover:border-gray-300 text-gray-600 bg-gray-50'
                    }`}
                  >
                    <span className="block">Accounts / Audit</span>
                    <span className="block text-[11px] font-normal opacity-75">passes it for payment</span>
                  </div>
                </div>
              </div>

              {(accountType === 'railway_official' || accountType === 'accounts_official') && (
                <div className="space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
                  <Label htmlFor="railwayZone" className="text-sm font-semibold text-gray-700">Railway Zone *</Label>
                  <Select
                    value={railwayZone}
                    onValueChange={(value) => {
                      setRailwayZone(value);
                      setFieldErrors((prev) => ({ ...prev, railwayZone: '' }));
                    }}
                  >
                    <SelectTrigger id="railwayZone" className="h-11 bg-gray-50 border-gray-200 focus:bg-white text-left">
                      <SelectValue placeholder="Select your railway zone" />
                    </SelectTrigger>
                    <SelectContent>
                      {zoneOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {fieldErrors.railwayZone && (
                    <p className="text-sm text-red-600">{fieldErrors.railwayZone}</p>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-semibold text-gray-700">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setFieldErrors((prev) => ({ ...prev, email: '' }));
                  }}
                  required
                  placeholder={accountType === 'contractor' ? 'you@example.com' : 'name@sr.railnet.gov.in'}
                  className={`h-11 px-4 bg-gray-50 border-gray-200 focus:bg-white transition-colors ${
                    fieldErrors.email ? 'border-red-500' : ''
                  }`}
                />
                {accountType !== 'contractor' && (
                  <p className="text-xs text-gray-500">
                    Department users must use an official railway email ending in {getOfficialRailwayEmailDomainHelp()}.
                    Admin approval is required after email verification.
                  </p>
                )}
                {fieldErrors.email && (
                  <p className="text-sm text-red-600">{fieldErrors.email}</p>
                )}
              </div>

              {accountType === 'contractor' && (
                <div className="space-y-2">
                  <Label htmlFor="referralCode" className="text-sm font-semibold text-gray-700">
                    Referral Code <span className="font-normal text-gray-400">(optional)</span>
                  </Label>
                  <Input
                    id="referralCode"
                    type="text"
                    value={referralCode}
                    onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                    placeholder="IRXXXXXXXXXX"
                    className="h-11 px-4 bg-gray-50 border-gray-200 focus:bg-white transition-colors uppercase"
                    maxLength={16}
                  />
                  <p className="text-xs text-gray-500">
                    After your first qualifying Rs. 1,000 top-up, both accounts receive Rs. 199 credit.
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="whatsappNumber" className="text-sm font-semibold text-gray-700">WhatsApp Number <span className="text-red-500">*</span></Label>
                <Input
                  id="whatsappNumber"
                  type="tel"
                  value={whatsappNumber}
                  onChange={(e) => {
                    setWhatsappNumber(e.target.value);
                    setFieldErrors({});
                  }}
                  required
                  placeholder="+919876543210"
                  className={`h-11 px-4 bg-gray-50 border-gray-200 focus:bg-white transition-colors ${
                    fieldErrors.whatsappNumber ? 'border-red-500' : ''
                  }`}
                />
                {fieldErrors.whatsappNumber && (
                  <p className="text-sm text-red-600">{fieldErrors.whatsappNumber}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-semibold text-gray-700">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="Create a strong password"
                  className="h-11 px-4 bg-gray-50 border-gray-200 focus:bg-white transition-colors"
                />
                <PasswordStrengthIndicator
                  password={password}
                  onValidationChange={setPasswordValidation}
                />
              </div>

              <Button
                type="submit"
                className="w-full h-12 bg-gradient-to-r from-emerald-600 via-emerald-600 to-emerald-700 hover:from-emerald-700 hover:via-emerald-700 hover:to-emerald-800 text-white font-semibold shadow-lg shadow-emerald-500/30 transition-all duration-200 hover:shadow-xl hover:shadow-emerald-500/40"
                disabled={loading}
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Creating Account...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    Create Account
                    <ArrowRight className="h-5 w-5" />
                  </span>
                )}
              </Button>
            </form>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-4 bg-white text-gray-500">Already have an account?</span>
              </div>
            </div>

            <div className="text-center">
              <Link
                href="/auth/signin"
                className="inline-flex items-center justify-center space-x-2 text-emerald-600 hover:text-emerald-700 font-semibold text-sm transition-colors"
              >
                <span>Sign in instead</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            <p className="text-xs text-center text-gray-500 mt-4">
              By creating an account, you agree to our Terms of Service and Privacy Policy
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
