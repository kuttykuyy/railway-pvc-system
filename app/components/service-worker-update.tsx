
'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { RefreshCw, X } from 'lucide-react';

export default function ServiceWorkerUpdate() {
  const [showUpdate, setShowUpdate] = useState(false);
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      // Only register on specific allowed domains (skip preview domains)
      const allowedDomains = ['irpvc.in', 'www.irpvc.in'];
      const isAllowedDomain = allowedDomains.some(domain => window.location.hostname === domain);
      const isSecure = window.location.protocol === 'https:' || window.location.hostname === 'localhost';
      
      if (!isAllowedDomain || !isSecure) {
        return;
      }

      // Register service worker
      navigator.serviceWorker
        .register('/sw.js')
        .then((reg) => {
          setRegistration(reg);

          // Check for updates periodically (every 30 seconds)
          const interval = setInterval(() => {
            reg.update();
          }, 30000);

          // Check for updates when page becomes visible
          document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
              reg.update();
            }
          });

          // Listen for new service worker waiting to activate
          reg.addEventListener('updatefound', () => {
            const newWorker = reg.installing;
            if (newWorker) {
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  // New service worker is ready
                  setShowUpdate(true);
                }
              });
            }
          });

          return () => clearInterval(interval);
        })
        .catch((err) => {
          console.error('[SW] Registration failed:', err);
        });

      // Listen for controller change (when new SW takes over)
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        window.location.reload();
      });
    }
  }, []);

  const handleUpdate = () => {
    if (registration?.waiting) {
      // Tell the waiting service worker to activate
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
  };

  if (!showUpdate) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm animate-in slide-in-from-bottom-4">
      <div className="bg-gradient-to-r from-violet-600 to-purple-600 text-white rounded-lg shadow-2xl p-4 border border-violet-400">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 mt-0.5">
            <RefreshCw className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold mb-1">New Version Available! 🎉</p>
            <p className="text-xs text-violet-100 mb-3">
              A new version of the app is ready. Click update to get the latest features and fixes.
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={handleUpdate}
                className="bg-white text-violet-600 hover:bg-violet-50 font-medium text-xs h-8"
              >
                <RefreshCw className="h-3 w-3 mr-1.5" />
                Update Now
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowUpdate(false)}
                className="text-white hover:bg-violet-700/50 h-8 text-xs"
              >
                Later
              </Button>
            </div>
          </div>
          <button
            onClick={() => setShowUpdate(false)}
            className="flex-shrink-0 text-violet-200 hover:text-white transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
