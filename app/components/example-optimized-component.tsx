/**
 * Example Optimized Component
 * Demonstrates Phase 2 performance optimizations
 * 
 * This file serves as a reference for implementing performance best practices
 */

'use client';

import { useEffect, useState, lazy, Suspense } from 'react';
import { debounce, throttle, observeElement } from '@/lib/pwa-utils';
import { logger } from '@/lib/logger';

// Lazy load heavy components (example - replace with actual component paths)
// const HeavyChart = lazy(() => import('./heavy-chart'));
// const HeavyTable = lazy(() => import('./heavy-table'));

/**
 * Example component with performance optimizations
 */
export function OptimizedComponent() {
  const [data, setData] = useState<any[]>([]);
  const [visibleSection, setVisibleSection] = useState<string>('');
  
  // Debounced search handler
  const handleSearch = debounce((query: string) => {
    logger.debug(`Searching for: ${query}`);
    // Perform search...
  }, 300);
  
  // Throttled scroll handler
  const handleScroll = throttle(() => {
    logger.debug('Scroll event');
    // Handle scroll...
  }, 100);
  
  // Intersection observer for lazy loading
  useEffect(() => {
    const element = document.getElementById('lazy-section');
    if (element) {
      observeElement(element, () => {
        logger.info('Lazy section is now visible');
        setVisibleSection('visible');
      });
    }
  }, []);
  
  return (
    <div>
      <input
        type="text"
        onChange={(e) => handleSearch(e.target.value)}
        placeholder="Search..."
      />
      
      <div onScroll={handleScroll}>
        {/* Regular content */}
      </div>
      
      <div id="lazy-section">
        {visibleSection === 'visible' && (
          <Suspense fallback={<div>Loading chart...</div>}>
            {/* <HeavyChart data={data} /> */}
            <div>Lazy loaded content would go here</div>
          </Suspense>
        )}
      </div>
    </div>
  );
}

// Export as default for lazy loading
export default OptimizedComponent;
