
/**
 * Advanced Caching Utilities
 * Phase 2 Performance Optimizations
 */

import { logger } from './logger';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
  tags: string[];
}

class AdvancedCache {
  private cache: Map<string, CacheEntry<any>>;
  private tagIndex: Map<string, Set<string>>;
  
  constructor() {
    this.cache = new Map();
    this.tagIndex = new Map();
  }
  
  /**
   * Set cache with tags for invalidation
   */
  set<T>(
    key: string,
    data: T,
    ttl: number = 300000, // 5 minutes default
    tags: string[] = []
  ): void {
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      ttl,
      tags
    };
    
    this.cache.set(key, entry);
    
    // Index by tags
    tags.forEach(tag => {
      if (!this.tagIndex.has(tag)) {
        this.tagIndex.set(tag, new Set());
      }
      this.tagIndex.get(tag)!.add(key);
    });
    
    logger.debug(`Cache set: ${key} with tags [${tags.join(', ')}]`);
  }
  
  /**
   * Get from cache
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      logger.debug(`Cache miss: ${key}`);
      return null;
    }
    
    // Check if expired
    if (Date.now() - entry.timestamp > entry.ttl) {
      logger.debug(`Cache expired: ${key}`);
      this.delete(key);
      return null;
    }
    
    logger.debug(`Cache hit: ${key}`);
    return entry.data as T;
  }
  
  /**
   * Get or set cache
   */
  async getOrSet<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttl: number = 300000,
    tags: string[] = []
  ): Promise<T> {
    const cached = this.get<T>(key);
    
    if (cached !== null) {
      return cached;
    }
    
    const data = await fetcher();
    this.set(key, data, ttl, tags);
    return data;
  }
  
  /**
   * Delete cache entry
   */
  delete(key: string): void {
    const entry = this.cache.get(key);
    
    if (entry) {
      // Remove from tag index
      entry.tags.forEach(tag => {
        const keys = this.tagIndex.get(tag);
        if (keys) {
          keys.delete(key);
          if (keys.size === 0) {
            this.tagIndex.delete(tag);
          }
        }
      });
      
      this.cache.delete(key);
      logger.debug(`Cache deleted: ${key}`);
    }
  }
  
  /**
   * Invalidate by tag
   */
  invalidateByTag(tag: string): number {
    const keys = this.tagIndex.get(tag);
    
    if (!keys) {
      return 0;
    }
    
    let count = 0;
    keys.forEach(key => {
      this.delete(key);
      count++;
    });
    
    logger.info(`Cache invalidated by tag "${tag}": ${count} entries`);
    return count;
  }
  
  /**
   * Invalidate by pattern
   */
  invalidateByPattern(pattern: RegExp): number {
    let count = 0;
    
    for (const key of this.cache.keys()) {
      if (pattern.test(key)) {
        this.delete(key);
        count++;
      }
    }
    
    logger.info(`Cache invalidated by pattern: ${count} entries`);
    return count;
  }
  
  /**
   * Clear all cache
   */
  clear(): void {
    const size = this.cache.size;
    this.cache.clear();
    this.tagIndex.clear();
    logger.info(`Cache cleared: ${size} entries`);
  }
  
  /**
   * Get cache stats
   */
  getStats(): {
    size: number;
    tags: number;
    memory: string;
  } {
    return {
      size: this.cache.size,
      tags: this.tagIndex.size,
      memory: `${Math.round(JSON.stringify([...this.cache.entries()]).length / 1024)}KB`
    };
  }
  
  /**
   * Clean expired entries
   */
  cleanup(): number {
    let count = 0;
    const now = Date.now();
    
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.delete(key);
        count++;
      }
    }
    
    if (count > 0) {
      logger.info(`Cache cleanup: ${count} expired entries removed`);
    }
    
    return count;
  }
}

// Global cache instance
export const advancedCache = new AdvancedCache();

// Auto-cleanup every 5 minutes
if (typeof window === 'undefined') {
  setInterval(() => {
    advancedCache.cleanup();
  }, 300000);
}

// Cache helper functions
export const cacheHelpers = {
  // Contract cache
  contracts: {
    get: (id: number) => advancedCache.get(`contract:${id}`),
    set: (id: number, data: any) => 
      advancedCache.set(`contract:${id}`, data, 600000, ['contracts']),
    invalidate: () => advancedCache.invalidateByTag('contracts')
  },
  
  // Bill cache
  bills: {
    get: (id: number) => advancedCache.get(`bill:${id}`),
    set: (id: number, data: any) => 
      advancedCache.set(`bill:${id}`, data, 300000, ['bills']),
    invalidate: () => advancedCache.invalidateByTag('bills'),
    invalidateContract: (contractId: number) => 
      advancedCache.invalidateByPattern(new RegExp(`bill:.*contract:${contractId}`))
  },
  
  // Classification cache
  classifications: {
    get: (contractId: number) => advancedCache.get(`classifications:${contractId}`),
    set: (contractId: number, data: any) => 
      advancedCache.set(`classifications:${contractId}`, data, 600000, ['classifications']),
    invalidate: () => advancedCache.invalidateByTag('classifications')
  },
  
  // Indices cache
  indices: {
    get: (key: string) => advancedCache.get(`indices:${key}`),
    set: (key: string, data: any) => 
      advancedCache.set(`indices:${key}`, data, 3600000, ['indices']), // 1 hour
    invalidate: () => advancedCache.invalidateByTag('indices')
  }
};
