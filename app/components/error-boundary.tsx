
'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorCount: number;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, errorCount: 0 };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Check if it's a chunk loading error
    const isChunkError = 
      error.name === 'ChunkLoadError' ||
      error.message.includes('Loading chunk') ||
      error.message.includes('Failed to fetch dynamically imported module');

    if (isChunkError) {
      // Increment error count
      const newCount = this.state.errorCount + 1;
      
      // If this is the first or second occurrence, try to reload
      if (newCount <= 2) {
        this.setState({ errorCount: newCount });
        
        // Wait a bit before reloading to avoid rapid reloads
        setTimeout(() => {
          window.location.reload();
        }, 1000);
      } else {
        // After 2 attempts, show error message
        this.setState({ errorCount: newCount });
      }
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorCount: 0 });
    window.location.reload();
  };

  render() {
    if (this.state.hasError && this.state.errorCount > 2) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-orange-50 p-4">
          <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
            <AlertTriangle className="h-16 w-16 text-amber-500 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              Something went wrong
            </h1>
            <p className="text-gray-600 mb-6">
              The application encountered an error loading some resources. 
              This might be due to a connection issue or an update.
            </p>
            <div className="space-y-3">
              <Button 
                onClick={this.handleReset}
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
                Go to Home
              </Button>
            </div>
            {this.state.error && (
              <details className="mt-6 text-left">
                <summary className="text-sm text-gray-500 cursor-pointer hover:text-gray-700">
                  Technical Details
                </summary>
                <pre className="mt-2 text-xs bg-gray-50 p-3 rounded overflow-auto max-h-40">
                  {this.state.error.toString()}
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    // During auto-reload attempts, show loading state
    if (this.state.hasError && this.state.errorCount <= 2) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-orange-50">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Reloading application...</p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
