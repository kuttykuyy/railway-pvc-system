'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowRight, CheckCircle, MessageCircle, Loader2, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { PasswordStrengthIndicator } from '@/components/password-strength-indicator';
import { validatePhoneNumber } from '@/lib/whatsapp-mydreams';

type Step = 'phone' | 'otp' | 'details';

export default function SignUpPage() {
  const [step, setStep] = useState<Step>('phone');
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '']);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
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
  const [cooldown, setCooldown] = useState(0);
  const [otpExpiresIn, setOtpExpiresIn] = useState(0);
  const [phoneVerified, setPhoneVerified] = useState(false);
  const otpInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const router = useRouter();

  // Cooldown timer
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown(c => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  // OTP expiry timer
  useEffect(() => {
    if (otpExpiresIn <= 0) return;
    const t = setInterval(() => setOtpExpiresIn(c => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [otpExpiresIn]);

  const handleSendOtp = async () => {
    setError('');
    setFieldErrors({});

    if (!whatsappNumber || !whatsappNumber.trim()) {
      setFieldErrors({ whatsappNumber: 'WhatsApp number is required' });
      return;
    }
    if (!validatePhoneNumber(whatsappNumber)) {
      setFieldErrors({ whatsappNumber: 'Invalid format. Use: +[country code][number] (e.g., +919876543210)' });
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: whatsappNumber }),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        setStep('otp');
        setCooldown(30);
        setOtpExpiresIn(data.expiresIn || 300);
        setOtpDigits(['', '', '', '', '', '']);
        // Focus first OTP input after render
        setTimeout(() => otpInputRefs.current[0]?.focus(), 100);
      } else {
        setError(data.error || 'Failed to send OTP');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleOtpChange = (index: number, value: string) => {
    if (value.length > 1) value = value.slice(-1);
    if (value && !/^\d$/.test(value)) return;

    const newDigits = [...otpDigits];
    newDigits[index] = value;
    setOtpDigits(newDigits);
    setError('');

    // Auto-advance to next input
    if (value && index < 5) {
      otpInputRefs.current[index + 1]?.focus();
    }

    // Auto-verify when all 6 digits entered
    if (value && index === 5 && newDigits.every(d => d !== '')) {
      verifyOtp(newDigits.join(''));
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length === 6) {
      const newDigits = pasted.split('');
      setOtpDigits(newDigits);
      otpInputRefs.current[5]?.focus();
      verifyOtp(pasted);
    }
  };

  const verifyOtp = async (otp: string) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: whatsappNumber, otp }),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        setPhoneVerified(true);
        setStep('details');
      } else {
        setError(data.error || 'Invalid OTP');
        // Reset digits on wrong OTP
        setOtpDigits(['', '', '', '', '', '']);
        setTimeout(() => otpInputRefs.current[0]?.focus(), 100);
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

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
    if (!phoneVerified) {
      setError('Please verify your WhatsApp number first');
      setLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, fullName, whatsappNumber }),
      });
      const data = await response.json();

      if (response.ok) {
        if (data.requiresVerification) {
          router.push(`/auth/verify-notice?email=${encodeURIComponent(email)}`);
        } else {
          router.push(`/auth/signin?registered=true&email=${encodeURIComponent(email)}`);
        }
      } else {
        setError(data.error || 'An error occurred during signup');
      }
    } catch {
      setError('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-blue-50 to-cyan-50 flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-grid-slate-200/50 [mask-image:linear-gradient(to_bottom,white,transparent)] pointer-events-none" />
      <div className="absolute top-20 left-10 w-72 h-72 bg-blue-200/20 rounded-full blur-3xl animate-pulse" />
      <div className="absolute bottom-20 right-10 w-96 h-96 bg-indigo-200/20 rounded-full blur-3xl animate-pulse delay-1000" />

      <div className="w-full max-w-md mx-auto relative z-10">
        <Card className="w-full shadow-2xl border-0 bg-white/95 backdrop-blur-sm">
          <CardHeader className="text-center pb-4 pt-8">
            <CardTitle className="text-2xl font-bold text-gray-900">
              Create Account
            </CardTitle>
            <CardDescription className="text-base text-gray-600 mt-2">
              {step === 'phone' && 'Verify your WhatsApp number to get started'}
              {step === 'otp' && 'Enter the OTP sent to your WhatsApp'}
              {step === 'details' && 'Complete your account details'}
            </CardDescription>

            {/* Step indicator */}
            <div className="flex items-center justify-center gap-2 mt-4">
              {(['phone', 'otp', 'details'] as Step[]).map((s, i) => (
                <div key={s} className="flex items-center gap-2">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-all ${
                    step === s ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' :
                    (['phone', 'otp', 'details'].indexOf(step) > i) ? 'bg-green-500 text-white' :
                    'bg-gray-200 text-gray-500'
                  }`}>
                    {(['phone', 'otp', 'details'].indexOf(step) > i) ? (
                      <CheckCircle className="h-4 w-4" />
                    ) : i + 1}
                  </div>
                  {i < 2 && <div className={`w-8 h-0.5 ${
                    (['phone', 'otp', 'details'].indexOf(step) > i) ? 'bg-green-400' : 'bg-gray-200'
                  }`} />}
                </div>
              ))}
            </div>
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

            {/* STEP 1: Phone Number */}
            {step === 'phone' && (
              <div className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="whatsappNumber" className="text-sm font-semibold text-gray-700">
                    WhatsApp Number <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="whatsappNumber"
                    type="tel"
                    value={whatsappNumber}
                    onChange={(e) => {
                      setWhatsappNumber(e.target.value);
                      setFieldErrors({});
                      setError('');
                    }}
                    placeholder="+919876543210"
                    className={`h-12 px-4 bg-gray-50 border-gray-200 focus:bg-white transition-colors text-lg ${
                      fieldErrors.whatsappNumber ? 'border-red-500' : ''
                    }`}
                    autoFocus
                  />
                  {fieldErrors.whatsappNumber && (
                    <p className="text-sm text-red-600">{fieldErrors.whatsappNumber}</p>
                  )}
                  <p className="text-xs text-gray-500">
                    Include country code (e.g., +91 for India). An OTP will be sent via WhatsApp.
                  </p>
                </div>

                <Button
                  type="button"
                  className="w-full h-12 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-semibold shadow-lg shadow-green-500/25"
                  onClick={handleSendOtp}
                  disabled={loading}
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Sending OTP...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <MessageCircle className="h-5 w-5" />
                      Send OTP via WhatsApp
                    </span>
                  )}
                </Button>
              </div>
            )}

            {/* STEP 2: OTP Verification */}
            {step === 'otp' && (
              <div className="space-y-5">
                <div className="text-center">
                  <div className="inline-flex items-center gap-2 bg-green-50 text-green-700 px-4 py-2 rounded-full text-sm font-medium mb-3">
                    <MessageCircle className="h-4 w-4" />
                    OTP sent to {whatsappNumber}
                  </div>
                  {otpExpiresIn > 0 && (
                    <p className="text-xs text-gray-500">
                      Expires in <span className="font-semibold text-orange-600">{formatTime(otpExpiresIn)}</span>
                    </p>
                  )}
                </div>

                <div className="space-y-3">
                  <Label className="text-sm font-semibold text-gray-700 text-center block">
                    Enter 6-digit OTP
                  </Label>
                  <div className="flex justify-center gap-2" onPaste={handleOtpPaste}>
                    {otpDigits.map((digit, i) => (
                      <Input
                        key={i}
                        ref={(el) => { otpInputRefs.current[i] = el; }}
                        type="text"
                        inputMode="numeric"
                        maxLength={1}
                        value={digit}
                        onChange={(e) => handleOtpChange(i, e.target.value)}
                        onKeyDown={(e) => handleOtpKeyDown(i, e)}
                        className="w-12 h-14 text-center text-xl font-bold bg-gray-50 border-gray-300 focus:border-blue-500 focus:bg-white"
                        disabled={loading}
                      />
                    ))}
                  </div>
                </div>

                {loading && (
                  <div className="flex items-center justify-center gap-2 text-blue-600">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm">Verifying...</span>
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-gray-500"
                    onClick={() => { setStep('phone'); setError(''); setOtpDigits(['','','','','','']); }}
                  >
                    ← Change Number
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-blue-600"
                    onClick={handleSendOtp}
                    disabled={cooldown > 0 || loading}
                  >
                    {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend OTP'}
                  </Button>
                </div>
              </div>
            )}

            {/* STEP 3: Account Details */}
            {step === 'details' && (
              <form onSubmit={handleSubmit} className="space-y-5">
                {/* Verified phone badge */}
                <div className="flex items-center gap-2 bg-green-50 border border-green-200 px-4 py-3 rounded-lg">
                  <ShieldCheck className="h-5 w-5 text-green-600 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-green-800">WhatsApp Verified</p>
                    <p className="text-xs text-green-600">{whatsappNumber}</p>
                  </div>
                </div>

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
                  <Label htmlFor="email" className="text-sm font-semibold text-gray-700">Email Address</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="you@example.com"
                    className="h-11 px-4 bg-gray-50 border-gray-200 focus:bg-white transition-colors"
                  />
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
                  className="w-full h-12 bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-700 hover:via-indigo-700 hover:to-blue-800 text-white font-semibold shadow-lg shadow-blue-500/30 transition-all duration-200 hover:shadow-xl hover:shadow-blue-500/40"
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
            )}

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
                className="inline-flex items-center justify-center space-x-2 text-blue-600 hover:text-blue-700 font-semibold text-sm transition-colors"
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
