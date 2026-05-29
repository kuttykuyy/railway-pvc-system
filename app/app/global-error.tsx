
'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Home } from 'lucide-react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Global application error:', error);
  }, [error]);

  return (
    <html>
      <body>
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-orange-50 p-4">
          <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
            <AlertTriangle className="h-16 w-16 text-red-500 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              Application Error
            </h1>
            <p className="text-gray-600 mb-6">
              A critical error occurred. Please reload the application.
            </p>
            <div className="space-y-3">
              <Button 
                onClick={() => window.location.reload()}
                className="w-full"
                size="lg"
              >
                Reload Application
              </Button>
              <Button 
                onClick={() => window.location.href = '/'}
                variant="outline"
                className="w-full"
                size="lg"
              >
                <Home className="h-4 w-4 mr-2" />
                Go to Home
              </Button>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
