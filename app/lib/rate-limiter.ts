
/**
 * Simple in-memory rate limiter
 * For production with multiple instances, use Redis
 */

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

class RateLimiter {
  private requests: Map<string, RateLimitEntry> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Cleanup expired entries every minute
    if (typeof window === 'undefined') {
      this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
    }
  }

  /**
   * Check if request is allowed
   * @param identifier Unique identifier (IP, user ID, etc.)
   * @param limit Maximum requests allowed
   * @param windowMs Time window in milliseconds
   * @returns Object with allowed status and remaining requests
   */
  check(
    identifier: string,
    limit: number,
    windowMs: number
  ): { allowed: boolean; remaining: number; resetIn: number } {
    const now = Date.now();
    const entry = this.requests.get(identifier);

    // No previous entry or window expired
    if (!entry || now >= entry.resetTime) {
      this.requests.set(identifier, {
        count: 1,
        resetTime: now + windowMs,
      });
      return {
        allowed: true,
        remaining: limit - 1,
        resetIn: windowMs,
      };
    }

    // Within window
    if (entry.count < limit) {
      entry.count++;
      return {
        allowed: true,
        remaining: limit - entry.count,
        resetIn: entry.resetTime - now,
      };
    }

    // Rate limit exceeded
    return {
      allowed: false,
      remaining: 0,
      resetIn: entry.resetTime - now,
    };
  }

  /**
   * Reset rate limit for an identifier
   */
  reset(identifier: string): void {
    this.requests.delete(identifier);
  }

  /**
   * Cleanup expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.requests.entries()) {
      if (now >= entry.resetTime) {
        this.requests.delete(key);
      }
    }
  }

  /**
   * Stop cleanup interval
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

// Singleton instance
const rateLimiter = new RateLimiter();

export default rateLimiter;

/**
 * Rate limit configurations
 */
export const RATE_LIMITS = {
  STRICT: { limit: 10, windowMs: 60000 }, // 10 requests per minute
  STANDARD: { limit: 30, windowMs: 60000 }, // 30 requests per minute
  RELAXED: { limit: 100, windowMs: 60000 }, // 100 requests per minute
  API: { limit: 60, windowMs: 60000 }, // 60 requests per minute
  EXPENSIVE: { limit: 5, windowMs: 60000 }, // 5 requests per minute (PDF generation, etc.)
} as const;

/**
 * Get identifier from request (IP or user ID)
 */
export function getIdentifier(request: Request, userId?: string): string {
  if (userId) return `user:${userId}`;
  
  // Try to get IP from headers
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0].trim() : 'unknown';
  return `ip:${ip}`;
}

/**
 * Rate limit middleware for API routes
 */
export function withRateLimit(
  limit: number,
  windowMs: number,
  getKey?: (request: Request) => string | Promise<string>
) {
  return async (request: Request) => {
    const identifier = getKey ? await getKey(request) : getIdentifier(request);
    const result = rateLimiter.check(identifier, limit, windowMs);

    if (!result.allowed) {
      return new Response(
        JSON.stringify({
          error: 'Rate limit exceeded',
          message: `Too many requests. Please try again in ${Math.ceil(result.resetIn / 1000)} seconds.`,
        }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': Math.ceil(result.resetIn / 1000).toString(),
            'X-RateLimit-Limit': limit.toString(),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': new Date(Date.now() + result.resetIn).toISOString(),
          },
        }
      );
    }

    return null; // Allow request
  };
}
