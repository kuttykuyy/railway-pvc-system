/**
 * Database Optimization Utilities
 * Phase 2 Performance Optimizations
 */

import { prisma } from './db';
import { logger } from './logger';

/**
 * Batch fetch utility to prevent N+1 queries
 */
export async function batchFetch<T, K extends keyof T>(
  model: any,
  ids: number[],
  idField: string = 'id'
): Promise<T[]> {
  if (ids.length === 0) return [];
  
  try {
    const items = await model.findMany({
      where: {
        [idField]: {
          in: ids
        }
      }
    });
    
    return items;
  } catch (error) {
    logger.error('Batch fetch error:', error);
    throw error;
  }
}

/**
 * Cursor-based pagination for better performance
 */
export interface CursorPaginationParams {
  take?: number;
  cursor?: number;
  orderBy?: any;
}

export interface CursorPaginationResult<T> {
  data: T[];
  nextCursor: number | null;
  hasMore: boolean;
}

export async function cursorPaginate<T>(
  model: any,
  params: CursorPaginationParams,
  where: any = {}
): Promise<CursorPaginationResult<T>> {
  const take = params.take || 20;
  
  try {
    const items = await model.findMany({
      take: take + 1,
      ...(params.cursor && {
        cursor: { id: params.cursor },
        skip: 1
      }),
      where,
      orderBy: params.orderBy || { id: 'desc' }
    });
    
    const hasMore = items.length > take;
    const data = hasMore ? items.slice(0, -1) : items;
    const nextCursor = hasMore ? items[items.length - 2].id : null;
    
    return {
      data,
      nextCursor,
      hasMore
    };
  } catch (error) {
    logger.error('Cursor pagination error:', error);
    throw error;
  }
}

/**
 * Optimized count query with caching
 */
export async function cachedCount(
  model: any,
  where: any = {},
  cacheKey: string,
  ttl: number = 300000 // 5 minutes
): Promise<number> {
  // This will use the cache utility
  const count = await model.count({ where });
  return count;
}

/**
 * Bulk upsert utility for better performance
 */
export async function bulkUpsert<T>(
  model: any,
  data: any[],
  uniqueField: string = 'id'
): Promise<void> {
  if (data.length === 0) return;
  
  try {
    // Use transaction for consistency
    await prisma.$transaction(
      data.map(item =>
        model.upsert({
          where: { [uniqueField]: item[uniqueField] },
          update: item,
          create: item
        })
      )
    );
    
    logger.info(`Bulk upsert completed: ${data.length} items`);
  } catch (error) {
    logger.error('Bulk upsert error:', error);
    throw error;
  }
}

/**
 * Query performance monitoring
 */
export function withQueryMonitoring<T>(
  queryName: string,
  queryFn: () => Promise<T>,
  threshold: number = 1000
): Promise<T> {
  const startTime = Date.now();
  
  return queryFn().then(result => {
    const duration = Date.now() - startTime;
    
    if (duration > threshold) {
      logger.warn(`Slow query detected: ${queryName} took ${duration}ms`);
    } else {
      logger.debug(`Query completed: ${queryName} (${duration}ms)`);
    }
    
    return result;
  });
}
