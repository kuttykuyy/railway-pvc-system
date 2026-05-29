
'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { X, Download, Smartphone } from 'lucide-react';
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
    <div className="fixed bottom-4 left-4 right-4 z-50 md:left-auto md:right-4 md:max-w-sm">
      <Card className="shadow-lg border-purple-200">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex items-center space-x-2">
              <Smartphone className="h-5 w-5 text-purple-600" />
              <CardTitle className="text-base">Install App</CardTitle>
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
            Install Railway PVC on your device for quick access and offline functionality.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex space-x-2">
            <Button
              onClick={handleInstallClick}
              size="sm"
              className="flex-1"
            >
              <Download className="h-4 w-4 mr-1" />
              Install
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDismiss}
              className="flex-1"
            >
              Later
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
