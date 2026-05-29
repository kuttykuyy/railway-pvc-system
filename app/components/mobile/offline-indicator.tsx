
'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
    <div className="fixed top-16 left-4 right-4 z-50 lg:top-4 lg:left-auto lg:right-4 lg:max-w-sm">
      <Card className={cn(
        "shadow-lg transition-colors",
        isOnline ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"
      )}>
        <CardContent className="px-4 py-3">
          <div className="flex items-center space-x-3">
            <div className={cn(
              "p-2 rounded-full",
              isOnline ? "bg-green-100" : "bg-red-100"
            )}>
              {isOnline ? (
                <Wifi className="h-4 w-4 text-green-600" />
              ) : (
                <WifiOff className="h-4 w-4 text-red-600" />
              )}
            </div>
            
            <div className="flex-1">
              <div className="flex items-center space-x-2">
                <span className={cn(
                  "text-sm font-medium",
                  isOnline ? "text-green-800" : "text-red-800"
                )}>
                  {isOnline ? "Back Online" : "You're Offline"}
                </span>
                <Badge
                  variant={isOnline ? "default" : "destructive"}
                  className="text-xs"
                >
                  {isOnline ? "Connected" : "No Internet"}
                </Badge>
              </div>
              
              <p className={cn(
                "text-xs mt-1",
                isOnline ? "text-green-600" : "text-red-600"
              )}>
                {isOnline 
                  ? "All features are available" 
                  : "Limited functionality - data will sync when connected"
                }
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
