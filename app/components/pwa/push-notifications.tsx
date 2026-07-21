
'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Bell, BellOff, Check, X } from 'lucide-react';
import { useSession } from 'next-auth/react';

export default function PushNotifications() {
  const { data: session } = useSession();
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isSupported, setIsSupported] = useState(false);

  useEffect(() => {
    // Check browser support first
    const supported = typeof window !== 'undefined' && 
                     'Notification' in window && 
                     'serviceWorker' in navigator && 
                     'PushManager' in window;
    
    setIsSupported(supported);
    
    if (!supported) {
      return;
    }

    try {
      setPermission(Notification.permission);
      
      // Show prompt if user is logged in and hasn't decided yet
      if (session && Notification.permission === 'default') {
        const hasShownBefore = localStorage.getItem('notification-prompt-shown');
        if (!hasShownBefore) {
          setTimeout(() => {
            setShowPrompt(true);
          }, 10000); // Show after 10 seconds
        }
      }

      // Check if already subscribed
      navigator.serviceWorker.ready
        .then(registration => {
          return registration.pushManager.getSubscription();
        })
        .then(sub => {
          setSubscription(sub);
        })
        .catch(error => {
          console.error('Error checking push subscription:', error);
        });
    } catch (error) {
      console.error('Error initializing push notifications:', error);
    }
  }, [session]);

  const requestNotificationPermission = async () => {
    setIsLoading(true);
    try {
      const permission = await Notification.requestPermission();
      setPermission(permission);
      
      if (permission === 'granted') {
        await subscribeToPush();
      }
    } catch (error) {
      console.error('Error requesting notification permission:', error);
    } finally {
      setIsLoading(false);
      setShowPrompt(false);
      localStorage.setItem('notification-prompt-shown', 'true');
    }
  };

  const subscribeToPush = async () => {
    if (!isSupported) {
      return;
    }

    const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidKey || vapidKey.trim() === '') {
      console.error('VAPID public key not configured');
      return;
    }

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlB64ToUint8Array(vapidKey),
      });

      setSubscription(subscription);

      // Send subscription to server
      const response = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          subscription,
          userEmail: session?.user?.email,
        }),
      });

      if (!response.ok) {
        console.error('Failed to save subscription on server');
      }
    } catch (error) {
      console.error('Error subscribing to push notifications:', error);
    }
  };

  const unsubscribeFromPush = async () => {
    if (subscription) {
      await subscription.unsubscribe();
      setSubscription(null);

      // Remove subscription from server
      await fetch('/api/push/unsubscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userEmail: session?.user?.email,
        }),
      });
    }
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    localStorage.setItem('notification-prompt-shown', 'true');
  };

  if (!session || !showPrompt || !isSupported) {
    return null;
  }

  return (
    <div className="fixed top-4 right-4 z-50 max-w-sm">
      <Card className="shadow-lg border-emerald-200">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex items-center space-x-2">
              <Bell className="h-5 w-5 text-emerald-600" />
              <CardTitle className="text-base">Stay Updated</CardTitle>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDismiss}
              className="h-6 w-6 p-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <CardDescription className="text-sm">
            Get notified about bill processing updates, payment confirmations, and important system announcements.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex space-x-2">
            <Button
              onClick={requestNotificationPermission}
              size="sm"
              className="flex-1"
              disabled={isLoading}
            >
              <Check className="h-4 w-4 mr-1" />
              Enable
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDismiss}
              className="flex-1"
            >
              Not Now
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Helper function to convert VAPID key
function urlB64ToUint8Array(base64String: string) {
  if (!base64String || typeof base64String !== 'string') {
    throw new Error('Invalid VAPID key provided');
  }

  try {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
      .replace(/-/g, '+')
      .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  } catch (error) {
    console.error('Error converting VAPID key:', error);
    throw new Error('Failed to convert VAPID key');
  }
}
