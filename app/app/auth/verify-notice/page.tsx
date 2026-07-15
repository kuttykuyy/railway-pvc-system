
'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Mail, ArrowRight, RefreshCw } from 'lucide-react';

function VerifyNoticeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get('email');
  // Signup tells us when the verification email did NOT go out, so we prompt a resend
  // instead of sending the user to look in an inbox that has nothing in it.
  const sendFailed = searchParams.get('sent') === '0';
  const [resending, setResending] = useState(false);
  const [resendMessage, setResendMessage] = useState('');
  const [resendOk, setResendOk] = useState<boolean | null>(null);

  const handleResendEmail = async () => {
    if (!email) return;

    setResending(true);
    setResendMessage('');
    setResendOk(null);

    try {
      const response = await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (response.ok) {
        setResendOk(true);
        setResendMessage('Verification email sent! Please check your inbox (and spam folder).');
      } else {
        setResendOk(false);
        setResendMessage(data.error || 'Failed to resend email. Please try again.');
      }
    } catch (error) {
      setResendOk(false);
      setResendMessage('An error occurred. Please try again later.');
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-white p-4 relative overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0 bg-grid-slate-200/50 [mask-image:linear-gradient(to_bottom,white,transparent)] pointer-events-none" />
      
      {/* Floating Elements */}
      <div className="absolute top-20 left-10 w-72 h-72 bg-blue-200/20 rounded-full blur-3xl animate-pulse" />
      <div className="absolute bottom-20 right-10 w-96 h-96 bg-indigo-200/20 rounded-full blur-3xl animate-pulse delay-1000" />

      <Card className="w-full max-w-md shadow-2xl border-0 bg-white/95 backdrop-blur-sm relative z-10">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="bg-blue-100 p-4 rounded-full">
              <Mail className="h-12 w-12 text-blue-600" />
            </div>
          </div>
          <CardTitle className="text-2xl">{sendFailed ? 'Almost there' : 'Check Your Email'}</CardTitle>
          <CardDescription className="text-base mt-2">
            {sendFailed
              ? 'Your account is created, but the verification email could not be sent'
              : "We've sent a verification link to your email address"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {email && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
              <p className="text-sm text-blue-800 font-medium">{email}</p>
            </div>
          )}

          {sendFailed ? (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <h4 className="font-medium text-red-900 mb-1">We couldn't send your verification email</h4>
              <p className="text-sm text-red-800">
                Please tap <strong>Resend Verification Email</strong> below. If it still doesn't arrive,
                check your spam folder or contact support — your account is safe and already created.
              </p>
            </div>
          ) : (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <h4 className="font-medium text-amber-900 mb-2">Next Steps:</h4>
              <ol className="list-decimal list-inside text-sm text-amber-800 space-y-1">
                <li>Check your email inbox (and spam folder)</li>
                <li>Click the verification link in the email</li>
                <li>Return here to sign in to your account</li>
              </ol>
            </div>
          )}

          {resendMessage && (
            <div className={`border rounded-lg p-4 text-sm ${
              resendOk
                ? 'bg-green-50 border-green-200 text-green-800'
                : 'bg-red-50 border-red-200 text-red-800'
            }`}>
              {resendMessage}
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Button
              onClick={handleResendEmail}
              variant="outline"
              className="w-full"
              disabled={resending || !email}
            >
              {resending ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Resend Verification Email
                </>
              )}
            </Button>

            <Button
              onClick={() => router.push('/auth/signin')}
              className="w-full"
              size="lg"
            >
              Go to Sign In
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>

          <div className="text-center text-sm text-muted-foreground">
            <p>The verification link will expire in 24 hours.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function VerifyNoticePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    }>
      <VerifyNoticeContent />
    </Suspense>
  );
}
