
/**
 * Simple in-memory cache with TTL support
 * For production, consider using Redis or similar
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

class Cache {
  private cache: Map<string, CacheEntry<any>> = new Map();

  /**
   * Get cached data
   * @param key Cache key
   * @returns Cached data or null if not found or expired
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    // Check if expired
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  /**
   * Set cache data
   * @param key Cache key
   * @param data Data to cache
   * @param ttl Time to live in milliseconds (default: 5 minutes)
   */
  set<T>(key: string, data: T, ttl: number = 5 * 60 * 1000): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl,
    });
  }

  /**
   * Invalidate cache entry
   * @param key Cache key
   */
  invalidate(key: string): void {
    this.cache.delete(key);
  }

  /**
   * Invalidate multiple cache entries by pattern
   * @param pattern Key pattern (e.g., 'bills:*')
   */
  invalidatePattern(pattern: string): void {
    const regex = new RegExp(
      '^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$'
    );

    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache size
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Clean expired entries
   */
  cleanExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Get or set cache with a factory function
   * @param key Cache key
   * @param factory Function to generate data if not cached
   * @param ttl Time to live in milliseconds
   */
  async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    ttl: number = 5 * 60 * 1000
  ): Promise<T> {
    const cached = this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    const data = await factory();
    this.set(key, data, ttl);
    return data;
  }

  /**
   * Check if a key exists and is not expired
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return false;
    }
    
    return true;
  }

  /**
   * Get all keys matching a pattern
   */
  getKeys(pattern?: string): string[] {
    if (!pattern) {
      return Array.from(this.cache.keys());
    }

    const regex = new RegExp(
      '^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$'
    );
    return Array.from(this.cache.keys()).filter(key => regex.test(key));
  }
}

// Singleton instance
const cache = new Cache();

// Clean expired entries every 10 minutes
if (typeof window !== 'undefined') {
  setInterval(() => cache.cleanExpired(), 10 * 60 * 1000);
}

export default cache;

/**
 * Cache keys for different data types
 */
export const CACHE_KEYS = {
  dashboard: 'dashboard',
  bills: (contractId?: string) => contractId ? `bills:contract:${contractId}` : 'bills:all',
  bill: (id: string) => `bill:${id}`,
  contracts: 'contracts:all',
  contract: (id: string) => `contract:${id}`,
  indices: 'indices:all',
  classifications: 'classifications:all',
  templates: (userId: string) => `templates:user:${userId}`,
};

/**
 * Cache TTL values (in milliseconds)
 */
export const CACHE_TTL = {
  SHORT: 1 * 60 * 1000, // 1 minute
  MEDIUM: 5 * 60 * 1000, // 5 minutes
  LONG: 15 * 60 * 1000, // 15 minutes
  VERY_LONG: 60 * 60 * 1000, // 1 hour
};
