
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle2 } from 'lucide-react';

export default function VerifySuccessPage() {
  const router = useRouter();
  const [countdown, setCountdown] = useState(5);
  const [isRedirecting, setIsRedirecting] = useState(false);

  // Countdown timer effect
  useEffect(() => {
    if (countdown <= 0 || isRedirecting) return;

    const timer = setTimeout(() => {
      setCountdown(countdown - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [countdown, isRedirecting]);

  // Redirect effect when countdown reaches 0
  useEffect(() => {
    if (countdown === 0 && !isRedirecting) {
      setIsRedirecting(true);
      // Use window.location for more reliable redirect
      window.location.href = '/auth/signin';
    }
  }, [countdown, isRedirecting]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-white p-4 relative overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0 bg-grid-slate-200/50 [mask-image:linear-gradient(to_bottom,white,transparent)] pointer-events-none" />
      
      {/* Floating Elements */}
      <div className="absolute top-20 left-10 w-72 h-72 bg-emerald-200/20 rounded-full blur-3xl animate-pulse" />
      <div className="absolute bottom-20 right-10 w-96 h-96 bg-blue-200/20 rounded-full blur-3xl animate-pulse delay-1000" />

      <Card className="w-full max-w-md shadow-2xl border-0 bg-white/95 backdrop-blur-sm relative z-10">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <CheckCircle2 className="h-16 w-16 text-green-500" />
          </div>
          <CardTitle className="text-2xl">Email Verified!</CardTitle>
          <CardDescription className="text-base mt-2">
            Your email has been successfully verified.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
            <p className="text-sm text-green-800">
              You can now sign in to your account and start using Railway PVC System.
            </p>
          </div>
          
          <div className="text-center text-sm text-muted-foreground">
            {isRedirecting ? (
              <div className="flex items-center justify-center gap-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                <span>Redirecting...</span>
              </div>
            ) : (
              <span>Redirecting to sign in page in {countdown} seconds...</span>
            )}
          </div>

          <Button 
            onClick={() => {
              setIsRedirecting(true);
              window.location.href = '/auth/signin';
            }}
            className="w-full"
            size="lg"
            disabled={isRedirecting}
          >
            {isRedirecting ? 'Redirecting...' : 'Sign In Now'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
