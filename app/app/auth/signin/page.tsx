'use client';

import { useState, useEffect, Suspense } from 'react';
import { signIn, useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowRight, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { clearAllCookies } from '@/lib/session-error-handler';
import { AuthShell, GoogleButton, OrDivider, ErrorBanner } from '@/components/auth/auth-shell';

const inputCls = 'h-11 px-3.5 bg-gray-50 border-gray-200 focus:bg-white transition-colors';

/**
 * Where to go after signing in.
 *
 * Only a path on this site is ever accepted — it must start with a single slash. That
 * rejects "https://elsewhere", and also "//elsewhere", which browsers treat as an
 * absolute URL and which is the usual way a redirect parameter gets used to bounce
 * someone to another site while looking like a link to this one.
 */
function safeCallbackUrl(requested: string | null): string {
  if (!requested) return '/contracts';
  if (!requested.startsWith('/') || requested.startsWith('//')) return '/contracts';
  return requested;
}

function SignInForm() {
  const { status } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const router = useRouter();
  const searchParams = useSearchParams();

  // Coming back from Google's account chooser with the browser's Back button restores
  // this page from the back/forward cache — React never remounts, so `loading`, set
  // just before a redirect that never returns, is still true and both sign-in buttons
  // are dead. Nothing else can clear it: the signIn promise never settles, so there is
  // no finally to hang this on. Reset when the page is restored.
  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) setLoading(false);
    };
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, []);

  // Handle session errors and success messages from URL parameters
  useEffect(() => {
    const urlError = searchParams.get('error');
    const urlMessage = searchParams.get('message');
    const urlEmail = searchParams.get('email');
    const registered = searchParams.get('registered');

    // Pre-populate email if provided
    if (urlEmail) {
      setEmail(decodeURIComponent(urlEmail));
    }

    // Show success message if account was just created
    if (urlMessage === 'success' || registered === 'true') {
      setSuccessMessage('Account created successfully! Please sign in with your credentials.');
      // Clear the message after 5 seconds
      setTimeout(() => setSuccessMessage(''), 5000);
    }

    if (urlError) {
      // Clear session cookies if there's a session-related error
      if (urlError === 'SessionExpired' || urlError === 'SessionCleared') {
        clearAllCookies();
        setError('Your session has expired. Please sign in again.');
      } else if (urlError === 'Configuration') {
        setError('Authentication configuration error. Please try again.');
      } else if (urlError === 'AccessDenied') {
        setError('Access denied. Please check your credentials.');
      } else if (urlError === 'Verification') {
        setError('Verification failed. Please try again.');
      } else if (urlError === 'EmailNotVerified') {
        setError('Please verify your email before signing in. Check your inbox for the verification link.');
      }
    }

    // Clear the display parameters from the URL — but keep callbackUrl: resetting to
    // the bare pathname also erased the requested destination, so any error or
    // "registered" banner arriving together with callbackUrl sent the user to the
    // default /contracts instead of where they were headed (e.g. /welcome).
    if (urlError || urlMessage || urlEmail || registered) {
      const keepCallback = searchParams.get('callbackUrl');
      const newUrl = keepCallback
        ? `${window.location.pathname}?callbackUrl=${encodeURIComponent(keepCallback)}`
        : window.location.pathname;
      window.history.replaceState({}, '', newUrl);
    }
  }, [searchParams]);

  const handleGoogleSignIn = async () => {
    try {
      setLoading(true);
      setError('');

      // Honour a requested destination (e.g. /welcome after email verification) —
      // hardcoding /contracts made Google sign-ins skip onboarding.
      await signIn('google', {
        callbackUrl: safeCallbackUrl(searchParams.get('callbackUrl')),
        redirect: true,
      });
    } catch (error) {
      console.error('Google sign-in error:', error);
      setError('Failed to sign in with Google. Please try again.');
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const result = await signIn('credentials', {
        email: email.toLowerCase().trim(),
        password,
        callbackUrl: '/contracts',
        redirect: false,
      });

      if (result?.error) {
        if (result.error === 'CredentialsSignin') {
          setError('Invalid email or password. Please check your credentials and try again.');
        } else if (result.error === 'EmailNotVerified' || result.error === 'Callback') {
          // Callback error might be thrown when signIn callback fails
          // Redirect to verify notice page with email
          router.push(`/auth/verify-notice?email=${encodeURIComponent(email)}`);
          return;
        } else {
          setError('Sign in failed. Please try again.');
        }
      } else if (result?.ok) {
        // Send Slack notification in the background
        fetch('/api/notify-login', { method: 'POST' }).catch(error => {
          console.error('Failed to send login notification:', error);
        });

        // Force a full page refresh to ensure session is updated.
        // Honour a requested destination so a just-verified account lands on the
        // onboarding uploads rather than an empty contracts table. Only same-site paths
        // are accepted, so the parameter cannot be used to bounce someone off the site.
        window.location.href = safeCallbackUrl(searchParams.get('callbackUrl'));
      } else {
        setError('An unexpected error occurred. Please try again.');
      }
    } catch (error) {
      setError('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell title="Welcome back" subtitle="Sign in to your contracts and bills.">
      <div className="space-y-5">
        {successMessage && (
          <div className="flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700" role="status">
            <svg className="mt-0.5 h-5 w-5 shrink-0 text-green-600" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <span>{successMessage}</span>
          </div>
        )}
        {error && <ErrorBanner>{error}</ErrorBanner>}

        <GoogleButton
          onClick={handleGoogleSignIn}
          disabled={loading || status === 'loading'}
          label={loading ? 'Signing in with Google…' : 'Continue with Google'}
        />
        <OrDivider>or with email</OrDivider>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-sm font-semibold text-gray-700">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              placeholder="you@example.com"
              className={inputCls}
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between">
              <Label htmlFor="password" className="text-sm font-semibold text-gray-700">Password</Label>
              <Link href="/auth/forgot-password" className="text-[13px] font-semibold text-emerald-700 hover:text-emerald-800">
                Forgot password?
              </Link>
            </div>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              placeholder="Enter your password"
              className={inputCls}
            />
          </div>

          <Button
            type="submit"
            className="w-full h-12 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-[15px] shadow-[0_8px_20px_-8px_rgba(5,150,105,0.5)]"
            disabled={loading}
          >
            {loading ? (
              <span className="flex items-center gap-2"><Loader2 className="h-5 w-5 animate-spin" />Signing in…</span>
            ) : (
              <span className="flex items-center gap-2">Sign in<ArrowRight className="h-[18px] w-[18px]" /></span>
            )}
          </Button>
        </form>

        <div className="h-px bg-gray-200" />

        <p className="text-center text-sm text-gray-600">
          New to IR-PVC?{' '}
          <Link href="/auth/signup" className="font-semibold text-emerald-700 hover:text-emerald-800">Create a free account</Link>
        </p>
      </div>
    </AuthShell>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    }>
      <SignInForm />
    </Suspense>
  );
}
