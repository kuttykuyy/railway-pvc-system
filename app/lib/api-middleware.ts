
/**
 * API Middleware and Optimization Layer
 * Phase 2 Performance Optimizations
 */

import { NextRequest, NextResponse } from 'next/server';
import { advancedCache } from './advanced-cache';
import { optimizeResponse, paginate, PaginationParams } from './compression';
import { logger } from './logger';
import { withTimeout, TIMEOUT_DEFAULTS } from './api-timeout';
import rateLimiter, { RATE_LIMITS, getIdentifier } from './rate-limiter';
import { withDatabaseConnection } from './db-connection';

interface CacheOptions {
  enabled: boolean;
  ttl?: number;
  tags?: string[];
  keyGenerator?: (req: NextRequest) => string;
}

interface OptimizationOptions {
  cache?: CacheOptions;
  timeout?: number;
  rateLimit?: {
    limit: number;
    windowMs: number;
  };
  pagination?: boolean;
  compression?: boolean;
}

/**
 * Create optimized API handler with caching, timeout, and rate limiting
 */
export function createOptimizedHandler(
  handler: (req: NextRequest) => Promise<NextResponse | any>,
  options: OptimizationOptions = {}
) {
  return async (req: NextRequest): Promise<NextResponse> => {
    const startTime = Date.now();
    
    try {
      // 1. Rate limiting
      if (options.rateLimit) {
        const identifier = getIdentifier(req);
        const limit = options.rateLimit.limit || RATE_LIMITS.API.limit;
        const windowMs = options.rateLimit.windowMs || RATE_LIMITS.API.windowMs;
        
        const rateLimit = rateLimiter.check(identifier, limit, windowMs);
        
        if (!rateLimit.allowed) {
          return NextResponse.json(
            { 
              error: 'Rate limit exceeded',
              message: `Too many requests. Please try again in ${Math.ceil(rateLimit.resetIn / 1000)} seconds.`
            },
            { 
              status: 429,
              headers: {
                'Retry-After': Math.ceil(rateLimit.resetIn / 1000).toString(),
              }
            }
          );
        }
      }
      
      // 2. Cache check (GET requests only)
      if (req.method === 'GET' && options.cache?.enabled) {
        const cacheKey = options.cache.keyGenerator 
          ? options.cache.keyGenerator(req)
          : `${req.method}:${req.url}`;
        
        const cached = advancedCache.get(cacheKey);
        if (cached) {
          logger.debug(`Cache hit for: ${cacheKey}`);
          return optimizeResponse(cached, { cache: true });
        }
      }
      
      // 3. Execute handler with timeout protection
      const timeout = options.timeout || TIMEOUT_DEFAULTS.LONG;
      const result = await withTimeout(handler(req), timeout, 'API Handler');
      
      // 4. Store in cache if enabled
      if (req.method === 'GET' && options.cache?.enabled && result instanceof NextResponse) {
        const cacheKey = options.cache.keyGenerator 
          ? options.cache.keyGenerator(req)
          : `${req.method}:${req.url}`;
        
        try {
          const data = await result.clone().json();
          advancedCache.set(
            cacheKey,
            data,
            options.cache.ttl || 300000,
            options.cache.tags || []
          );
        } catch (e) {
          // Response might not be JSON, skip caching
        }
      }
      
      // 5. Log performance
      const duration = Date.now() - startTime;
      if (duration > 1000) {
        logger.warn(`Slow API request: ${req.method} ${req.url} (${duration}ms)`);
      } else {
        logger.debug(`API request completed: ${req.method} ${req.url} (${duration}ms)`);
      }
      
      // 6. Return optimized response
      if (result instanceof NextResponse) {
        return result;
      }
      
      return options.cache?.enabled 
        ? optimizeResponse(result, { cache: true })
        : NextResponse.json(result);
      
    } catch (error: any) {
      logger.error('API handler error:', error);
      
      return NextResponse.json(
        {
          error: error.message || 'Internal server error',
          requestId: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
        },
        { status: error.status || 500 }
      );
    }
  };
}

/**
 * Batch operation helper
 */
export async function batchProcess<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  batchSize: number = 10
): Promise<R[]> {
  const results: R[] = [];
  
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(processor));
    results.push(...batchResults);
    
    // Log progress for large batches
    if (items.length > 50) {
      logger.debug(`Batch progress: ${Math.min(i + batchSize, items.length)}/${items.length}`);
    }
  }
  
  return results;
}

/**
 * Query result transformer with field selection
 */
export function transformQueryResult<T extends Record<string, any>>(
  data: T | T[],
  options: {
    fields?: string[];
    exclude?: string[];
    transform?: (item: T) => any;
  } = {}
): any {
  const transformItem = (item: T) => {
    let result = { ...item };
    
    // Apply field selection
    if (options.fields && options.fields.length > 0) {
      result = options.fields.reduce((acc, field) => {
        if (field in item) {
          acc[field] = item[field];
        }
        return acc;
      }, {} as any);
    }
    
    // Apply exclusion
    if (options.exclude && options.exclude.length > 0) {
      options.exclude.forEach(field => {
        delete result[field];
      });
    }
    
    // Apply custom transform
    if (options.transform) {
      result = options.transform(result as T);
    }
    
    return result;
  };
  
  if (Array.isArray(data)) {
    return data.map(transformItem);
  }
  
  return transformItem(data);
}

/**
 * Invalidate cache by patterns
 */
export function invalidateCache(patterns: {
  tags?: string[];
  keys?: string[];
  regex?: RegExp[];
}): void {
  if (patterns.tags) {
    patterns.tags.forEach(tag => {
      advancedCache.invalidateByTag(tag);
    });
  }
  
  if (patterns.keys) {
    patterns.keys.forEach(key => {
      advancedCache.delete(key);
    });
  }
  
  if (patterns.regex) {
    patterns.regex.forEach(regex => {
      advancedCache.invalidateByPattern(regex);
    });
  }
}

/**
 * Check if an error is an idle-session timeout error
 */
function isIdleSessionTimeout(error: any): boolean {
  if (!error) return false
  
  const errorMsg = error?.message?.toLowerCase() || ''
  const errorCode = error?.code || ''
  const sqlState = error?.meta?.sqlState || ''
  
  return (
    // PostgreSQL error code for idle_session_timeout
    sqlState === '57P05' ||
    // Other connection errors
    sqlState === '57P03' ||
    sqlState === '08003' ||
    sqlState === '08006' ||
    // Prisma error codes
    errorCode === 'P1001' ||
    errorCode === 'P1002' ||
    errorCode === 'P1017' ||
    errorCode === 'P2024' ||
    // Error message patterns
    errorMsg.includes('idle-session') ||
    errorMsg.includes('idle_session_timeout') ||
    errorMsg.includes('terminating connection') ||
    errorMsg.includes('connection terminated') ||
    errorMsg.includes('connection closed') ||
    errorMsg.includes('server closed')
  )
}

/**
 * Wrap an API handler with automatic retry on idle-session timeout
 * 
 * Usage:
 * export const GET = withDatabaseRetry(async (req) => {
 *   // Your API logic here
 * })
 */
export function withDatabaseRetry<T extends any[]>(
  handler: (...args: T) => Promise<NextResponse>
) {
  return async (...args: T): Promise<NextResponse> => {
    try {
      return await withDatabaseConnection(
        () => handler(...args),
        3,
        'API handler'
      )
    } catch (error: any) {
      logger.error('API handler database error:', {
        message: error?.message,
        code: error?.code,
        sqlState: error?.meta?.sqlState,
      })
      
      // Check if it's an idle-session timeout error
      if (isIdleSessionTimeout(error)) {
        return NextResponse.json(
          { 
            error: 'Database connection temporarily unavailable. Please try again.',
            code: 'DATABASE_TIMEOUT',
            retry: true
          },
          { status: 503 }
        )
      }
      
      // For other errors, return generic error
      return NextResponse.json(
        { 
          error: error?.message || 'Internal server error',
          code: error?.code || 'INTERNAL_ERROR'
        },
        { status: error?.status || 500 }
      )
    }
  }
}
