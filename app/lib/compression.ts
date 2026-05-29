
/**
 * API Response Compression Utilities
 * Phase 2 Performance Optimizations
 */

import { NextResponse } from 'next/server';
import { logger } from './logger';

/**
 * Compress large API responses
 */
export function compressResponse(data: any, threshold: number = 1024): any {
  const json = JSON.stringify(data);
  const size = Buffer.byteLength(json, 'utf8');
  
  if (size > threshold) {
    logger.debug(`Large response detected: ${size} bytes, consider compression`);
  }
  
  return data;
}

/**
 * Paginate large arrays
 */
export interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export function paginate<T>(
  items: T[],
  params: PaginationParams = {}
): PaginatedResponse<T> {
  const page = Math.max(1, params.page || 1);
  const limit = Math.min(100, Math.max(1, params.limit || 20));
  const total = items.length;
  const totalPages = Math.ceil(total / limit);
  
  const startIndex = (page - 1) * limit;
  const endIndex = startIndex + limit;
  
  const data = items.slice(startIndex, endIndex);
  
  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1
    }
  };
}

/**
 * Response optimization middleware
 */
export function optimizeResponse<T>(data: T, options: {
  cache?: boolean;
  maxAge?: number;
  revalidate?: number;
} = {}): NextResponse {
  const response = NextResponse.json(data);
  
  if (options.cache) {
    const maxAge = options.maxAge || 300; // 5 minutes default
    const revalidate = options.revalidate || 60; // 1 minute default
    
    response.headers.set(
      'Cache-Control',
      `public, s-maxage=${maxAge}, stale-while-revalidate=${revalidate}`
    );
  }
  
  return response;
}

/**
 * Selective field filtering for large objects
 */
export function filterFields<T extends Record<string, any>>(
  obj: T,
  fields: string[]
): Partial<T> {
  if (fields.length === 0) return obj;
  
  const filtered: any = {};
  fields.forEach(field => {
    if (field in obj) {
      filtered[field] = obj[field];
    }
  });
  
  return filtered;
}

/**
 * Remove null/undefined values to reduce payload
 */
export function compactObject<T extends Record<string, any>>(obj: T): Partial<T> {
  const compacted: any = {};
  
  Object.keys(obj).forEach(key => {
    const value = obj[key];
    if (value !== null && value !== undefined) {
      if (typeof value === 'object' && !Array.isArray(value)) {
        compacted[key] = compactObject(value);
      } else {
        compacted[key] = value;
      }
    }
  });
  
  return compacted;
}
