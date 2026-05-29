
'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { WifiOff, RefreshCw } from 'lucide-react';

export default function OfflinePage() {
  const handleRetry = () => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 p-3 bg-gray-100 rounded-full w-fit">
            <WifiOff className="h-8 w-8 text-gray-600" />
          </div>
          <CardTitle>You're Offline</CardTitle>
          <CardDescription>
            It looks like you don't have an internet connection. Don't worry, you can still view previously loaded content.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-sm text-gray-600">
            <p>While offline, you can:</p>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>View previously loaded contracts and bills</li>
              <li>Create draft bills (will sync when online)</li>
              <li>Browse cached reports</li>
            </ul>
          </div>
          <Button 
            onClick={handleRetry} 
            className="w-full"
            variant="outline"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Try Again
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
