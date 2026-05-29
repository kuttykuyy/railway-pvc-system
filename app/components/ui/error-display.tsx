
import { AlertCircle, RefreshCw, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import Link from 'next/link';

interface ErrorDisplayProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  retryText?: string;
  showHomeButton?: boolean;
  variant?: 'card' | 'alert' | 'full';
}

export function ErrorDisplay({
  title = 'Something went wrong',
  message,
  onRetry,
  retryText = 'Try Again',
  showHomeButton = false,
  variant = 'card',
}: ErrorDisplayProps) {
  if (variant === 'alert') {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription className="flex items-center justify-between">
          <span>{message}</span>
          {onRetry && (
            <Button
              variant="outline"
              size="sm"
              onClick={onRetry}
              className="ml-4"
            >
              <RefreshCw className="mr-2 h-3 w-3" />
              {retryText}
            </Button>
          )}
        </AlertDescription>
      </Alert>
    );
  }

  if (variant === 'full') {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-4 max-w-md">
          <div className="flex justify-center">
            <div className="rounded-full bg-red-100 p-3">
              <AlertCircle className="h-8 w-8 text-red-600" />
            </div>
          </div>
          <div>
            <h3 className="text-lg font-semibold">{title}</h3>
            <p className="text-sm text-muted-foreground mt-2">{message}</p>
          </div>
          <div className="flex gap-2 justify-center">
            {onRetry && (
              <Button onClick={onRetry}>
                <RefreshCw className="mr-2 h-4 w-4" />
                {retryText}
              </Button>
            )}
            {showHomeButton && (
              <Button variant="outline" asChild>
                <Link href="/dashboard">
                  <Home className="mr-2 h-4 w-4" />
                  Go Home
                </Link>
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Default card variant
  return (
    <Card className="border-red-200">
      <CardHeader>
        <div className="flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-red-600" />
          <CardTitle className="text-red-900">{title}</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <CardDescription className="text-red-700">{message}</CardDescription>
      </CardContent>
      {(onRetry || showHomeButton) && (
        <CardFooter className="flex gap-2">
          {onRetry && (
            <Button onClick={onRetry} variant="default">
              <RefreshCw className="mr-2 h-4 w-4" />
              {retryText}
            </Button>
          )}
          {showHomeButton && (
            <Button variant="outline" asChild>
              <Link href="/dashboard">
                <Home className="mr-2 h-4 w-4" />
                Go Home
              </Link>
            </Button>
          )}
        </CardFooter>
      )}
    </Card>
  );
}

export function ErrorMessage({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 p-3 rounded-md">
      <AlertCircle className="h-4 w-4 flex-shrink-0" />
      <span>{message}</span>
    </div>
  );
}
