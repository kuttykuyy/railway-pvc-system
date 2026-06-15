
'use client';

import { useState, useEffect } from 'react';
import { WifiOff, Wifi } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function OfflineIndicator() {
  const [isOnline, setIsOnline] = useState(true);
  const [showIndicator, setShowIndicator] = useState(false);

  useEffect(() => {
    const updateOnlineStatus = () => {
      const online = navigator.onLine;
      setIsOnline(online);
      
      if (!online) {
        setShowIndicator(true);
      } else if (showIndicator) {
        // Show "back online" message briefly
        setTimeout(() => {
          setShowIndicator(false);
        }, 3000);
      }
    };

    // Set initial status
    updateOnlineStatus();

    // Listen for online/offline events
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);

    return () => {
      window.removeEventListener('online', updateOnlineStatus);
      window.removeEventListener('offline', updateOnlineStatus);
    };
  }, [showIndicator]);

  if (!showIndicator) return null;

  return (
    <div className="fixed top-16 left-4 right-4 z-50 lg:top-4 lg:left-auto lg:right-4 lg:max-w-sm animate-in slide-in-from-top-4">
      <div className={cn(
        "rounded-xl px-4 py-2.5 text-sm font-semibold shadow-md border transition-all duration-200",
        isOnline
          ? "bg-green-50 text-green-800 border-green-100"
          : "bg-red-50 text-red-800 border-red-100"
      )}>
        <span className="flex items-center gap-2">
          {isOnline ? <Wifi className="h-4 w-4 text-green-600" /> : <WifiOff className="h-4 w-4 text-red-600" />}
          {isOnline ? 'Back online' : 'You are offline'}
        </span>
      </div>
    </div>
  );
}
