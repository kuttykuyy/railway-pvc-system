
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import MobileBillsList from '@/components/mobile/mobile-bills-list';

export default function MobileBillsPage() {
  const router = useRouter();
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 1024;
      setIsMobile(mobile);
      
      // Redirect desktop users to main bills page
      if (!mobile) {
        router.replace('/bills');
      }
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => window.removeEventListener('resize', checkMobile);
  }, [router]);

  if (!isMobile) {
    return (
      <div className="flex justify-center items-center min-h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
      </div>
    );
  }

  return <MobileBillsList />;
}
