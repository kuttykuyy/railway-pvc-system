
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

// This page has been merged with the Profile page
// Redirecting to /profile with security tab
export default function SecurityPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/profile#security');
  }, [router]);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
        <p className="text-muted-foreground">Redirecting to Profile & Settings...</p>
      </div>
    </div>
  );
}
