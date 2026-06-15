
'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { X, Smartphone } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Check if running in browser
    if (typeof window === 'undefined') {
      return;
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      
      // Don't show immediately, wait for user interaction
      try {
        const hasShownBefore = localStorage.getItem('pwa-install-prompt-shown');
        if (!hasShownBefore) {
          setTimeout(() => {
            setShowInstallPrompt(true);
          }, 5000); // Show after 5 seconds
        }
      } catch (error) {
        console.error('Error accessing localStorage:', error);
      }
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setShowInstallPrompt(false);
      try {
        localStorage.setItem('pwa-installed', 'true');
      } catch (error) {
        console.error('Error saving to localStorage:', error);
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    // Check if already installed
    try {
      const installed = localStorage.getItem('pwa-installed');
      if (installed) {
        setIsInstalled(true);
      }
    } catch (error) {
      console.error('Error checking localStorage:', error);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;

    try {
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
    } catch (error) {
      console.error('Error handling install prompt:', error);
    }
    
    setDeferredPrompt(null);
    setShowInstallPrompt(false);
    
    try {
      localStorage.setItem('pwa-install-prompt-shown', 'true');
    } catch (error) {
      console.error('Error saving to localStorage:', error);
    }
  };

  const handleDismiss = () => {
    setShowInstallPrompt(false);
    try {
      localStorage.setItem('pwa-install-prompt-shown', 'true');
    } catch (error) {
      console.error('Error saving to localStorage:', error);
    }
  };

  if (isInstalled || !showInstallPrompt || !deferredPrompt) {
    return null;
  }

  return (
    <div className="fixed bottom-20 left-4 right-4 z-50 md:left-auto md:right-4 md:max-w-sm animate-in slide-in-from-bottom-4">
      <div className="bg-white rounded-2xl shadow-lg border border-slate-100 p-4">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl bg-violet-100 flex items-center justify-center flex-shrink-0">
            <Smartphone className="h-5 w-5 text-violet-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-900">Install IR-PVC</p>
            <p className="text-xs text-slate-500 mt-0.5">Add to home screen for quick access and offline use.</p>
            <div className="flex gap-2 mt-3">
              <Button size="sm" className="flex-1 bg-violet-600 hover:bg-violet-700 rounded-xl font-semibold" onClick={handleInstallClick}>
                Install
              </Button>
              <Button size="sm" variant="ghost" className="flex-1 text-slate-500 hover:bg-slate-50 rounded-xl font-semibold" onClick={handleDismiss}>
                Later
              </Button>
            </div>
          </div>
          <button onClick={handleDismiss} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-50">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
