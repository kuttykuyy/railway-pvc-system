
'use client';

import { useEffect } from 'react';

export default function ChunkErrorHandler() {
  useEffect(() => {
    // Track chunk loading errors
    let chunkErrorCount = 0;
    const maxRetries = 2;

    // Global error handler for unhandled promise rejections
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const error = event.reason;
      const isChunkError = 
        error?.name === 'ChunkLoadError' ||
        error?.message?.includes('Loading chunk') ||
        error?.message?.includes('Failed to fetch dynamically imported module') ||
        event.reason?.toString().includes('Loading chunk');

      if (isChunkError) {
        event.preventDefault();
        chunkErrorCount++;

        if (chunkErrorCount <= maxRetries) {
          
          // Store reload timestamp to prevent infinite loops
          const lastReload = sessionStorage.getItem('lastChunkErrorReload');
          const now = Date.now();
          
          if (!lastReload || now - parseInt(lastReload) > 5000) {
            sessionStorage.setItem('lastChunkErrorReload', now.toString());
            setTimeout(() => {
              window.location.reload();
            }, 1000);
          }
        }
      }
    };

    // Global error handler for script loading errors
    const handleError = (event: ErrorEvent) => {
      const isChunkError = 
        event.message?.includes('Loading chunk') ||
        event.message?.includes('Failed to fetch');

      if (isChunkError) {
        event.preventDefault();
        chunkErrorCount++;

        if (chunkErrorCount <= maxRetries) {
          
          const lastReload = sessionStorage.getItem('lastChunkErrorReload');
          const now = Date.now();
          
          if (!lastReload || now - parseInt(lastReload) > 5000) {
            sessionStorage.setItem('lastChunkErrorReload', now.toString());
            setTimeout(() => {
              window.location.reload();
            }, 1000);
          }
        }
      }
    };

    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    window.addEventListener('error', handleError);

    // Clear old reload timestamps
    const lastReload = sessionStorage.getItem('lastChunkErrorReload');
    if (lastReload && Date.now() - parseInt(lastReload) > 60000) {
      sessionStorage.removeItem('lastChunkErrorReload');
    }

    return () => {
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
      window.removeEventListener('error', handleError);
    };
  }, []);

  return null;
}
