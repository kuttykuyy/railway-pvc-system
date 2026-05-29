'use client';

import { useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { LoadingSpinner } from '@/components/ui/loading-spinner';

function RedirectContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  useEffect(() => {
    // Preserve query parameters when redirecting
    const params = searchParams?.toString();
    const redirectUrl = params ? `/bills/new?${params}` : '/bills/new';
    router.replace(redirectUrl);
  }, [router, searchParams]);
  
  return (
    <div className="flex justify-center items-center min-h-screen">
      <LoadingSpinner size="lg" text="Redirecting..." />
    </div>
  );
}

export default function BillFormRedirect() {
  return (
    <Suspense fallback={
      <div className="flex justify-center items-center min-h-screen">
        <LoadingSpinner size="lg" text="Loading..." />
      </div>
    }>
      <RedirectContent />
    </Suspense>
  );
}
