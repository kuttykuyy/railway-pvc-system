
'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { XCircle, AlertCircle } from 'lucide-react';

function VerifyErrorContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const error = searchParams.get('error');
  
  const getErrorMessage = () => {
    switch (error) {
      case 'missing_token':
        return {
          title: 'Missing Verification Token',
          description: 'The verification link is invalid or incomplete.',
        };
      case 'invalid_token':
        return {
          title: 'Invalid Token',
          description: 'The verification link is invalid or has already been used.',
        };
      case 'expired_token':
        return {
          title: 'Link Expired',
          description: 'This verification link has expired. Please request a new one.',
        };
      case 'server_error':
        return {
          title: 'Server Error',
          description: 'An error occurred while verifying your email. Please try again later.',
        };
      default:
        return {
          title: 'Verification Failed',
          description: 'We couldn\'t verify your email address.',
        };
    }
  };

  const errorInfo = getErrorMessage();

  return (
    <div className="min-h-screen flex items-center justify-center bg-white p-4 relative overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0 bg-grid-slate-200/50 [mask-image:linear-gradient(to_bottom,white,transparent)] pointer-events-none" />
      
      {/* Floating Elements */}
      <div className="absolute top-20 left-10 w-72 h-72 bg-red-200/20 rounded-full blur-3xl animate-pulse" />
      <div className="absolute bottom-20 right-10 w-96 h-96 bg-orange-200/20 rounded-full blur-3xl animate-pulse delay-1000" />

      <Card className="w-full max-w-md shadow-2xl border-0 bg-white/95 backdrop-blur-sm relative z-10">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <XCircle className="h-16 w-16 text-red-500" />
          </div>
          <CardTitle className="text-2xl">{errorInfo.title}</CardTitle>
          <CardDescription className="text-base mt-2">
            {errorInfo.description}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <div className="flex gap-2">
              <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-amber-800">
                <p className="font-medium mb-1">What to do next:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>Check your email for a new verification link</li>
                  <li>Try signing up again if you haven't completed registration</li>
                  <li>Contact support if the problem persists</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Button 
              onClick={() => router.push('/auth/signup')} 
              className="w-full"
              size="lg"
            >
              Go to Sign Up
            </Button>
            
            <Button 
              onClick={() => router.push('/auth/signin')} 
              variant="outline"
              className="w-full"
              size="lg"
            >
              Back to Sign In
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function VerifyErrorPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    }>
      <VerifyErrorContent />
    </Suspense>
  );
}
