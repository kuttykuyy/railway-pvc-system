/**
 * PWA and Performance Utilities
 * Phase 2 Performance Optimizations
 */

import { logger } from './logger';

/**
 * Lazy load components with error boundary
 */
export function lazyLoadComponent(
  importFn: () => Promise<any>,
  componentName: string
) {
  return async () => {
    try {
      logger.debug(`Loading component: ${componentName}`);
      return await importFn();
    } catch (error) {
      logger.error(`Failed to load component: ${componentName}`, error);
      throw error;
    }
  };
}

/**
 * Preload critical resources
 */
export function preloadResources(resources: string[]): void {
  if (typeof window === 'undefined') return;
  
  resources.forEach(resource => {
    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = getResourceType(resource);
    link.href = resource;
    document.head.appendChild(link);
  });
}

function getResourceType(url: string): string {
  if (url.endsWith('.js')) return 'script';
  if (url.endsWith('.css')) return 'style';
  if (url.match(/\.(jpg|jpeg|png|gif|webp)$/)) return 'image';
  if (url.match(/\.(woff|woff2|ttf|otf)$/)) return 'font';
  return 'fetch';
}

/**
 * Defer non-critical scripts
 */
export function deferScript(src: string, onLoad?: () => void): void {
  if (typeof window === 'undefined') return;
  
  const script = document.createElement('script');
  script.src = src;
  script.defer = true;
  
  if (onLoad) {
    script.onload = onLoad;
  }
  
  document.body.appendChild(script);
}

/**
 * Intersection Observer for lazy loading
 */
export function observeElement(
  element: HTMLElement,
  callback: () => void,
  options?: IntersectionObserverInit
): IntersectionObserver | null {
  if (typeof window === 'undefined' || !('IntersectionObserver' in window)) {
    // Fallback for unsupported browsers
    callback();
    return null;
  }
  
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        callback();
        observer.unobserve(element);
      }
    });
  }, options);
  
  observer.observe(element);
  return observer;
}

/**
 * Debounce function for performance
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;
  
  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      timeout = null;
      func(...args);
    };
    
    if (timeout) {
      clearTimeout(timeout);
    }
    
    timeout = setTimeout(later, wait);
  };
}

/**
 * Throttle function for performance
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean = false;
  
  return function executedFunction(...args: Parameters<T>) {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

/**
 * Memory usage monitor
 */
export function getMemoryUsage(): {
  used: number;
  total: number;
  percentage: number;
} | null {
  if (typeof window === 'undefined' || !(performance as any).memory) {
    return null;
  }
  
  const memory = (performance as any).memory;
  const used = memory.usedJSHeapSize;
  const total = memory.totalJSHeapSize;
  
  return {
    used: Math.round(used / 1024 / 1024),
    total: Math.round(total / 1024 / 1024),
    percentage: Math.round((used / total) * 100)
  };
}

/**
 * Performance mark and measure
 */
export class PerformanceMonitor {
  private marks: Map<string, number> = new Map();
  
  mark(name: string): void {
    this.marks.set(name, performance.now());
  }
  
  measure(name: string, startMark: string, endMark?: string): number {
    const start = this.marks.get(startMark);
    if (!start) {
      logger.warn(`Start mark not found: ${startMark}`);
      return 0;
    }
    
    const end = endMark ? this.marks.get(endMark) : performance.now();
    if (endMark && !end) {
      logger.warn(`End mark not found: ${endMark}`);
      return 0;
    }
    
    const duration = (end as number) - start;
    logger.debug(`Performance: ${name} = ${duration.toFixed(2)}ms`);
    
    return duration;
  }
  
  clear(): void {
    this.marks.clear();
  }
}

export const perfMonitor = new PerformanceMonitor();
