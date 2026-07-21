
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import MobileBillForm from '@/components/mobile/mobile-bill-form';

export default function MobileNewBillPage() {
  const router = useRouter();
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 1024;
      setIsMobile(mobile);
      
      // Redirect desktop users to main new bill page
      if (!mobile) {
        router.replace('/bills/new');
      }
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => window.removeEventListener('resize', checkMobile);
  }, [router]);

  if (!isMobile) {
    return (
      <div className="flex justify-center items-center min-h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  return <MobileBillForm mode="create" />;
}
