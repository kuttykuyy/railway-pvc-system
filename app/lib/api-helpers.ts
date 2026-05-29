
/**
 * API Helper Utilities
 * Common helpers for API route optimization
 */

import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { withTimeout, TIMEOUT_DEFAULTS, TimeoutError } from './api-timeout';
import rateLimiter, { RATE_LIMITS, getIdentifier } from './rate-limiter';
import { handleApiError } from './error-handler';

/**
 * Parse pagination parameters from request
 */
export function getPaginationParams(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)));
  const skip = (page - 1) * limit;

  return { page, limit, skip };
}

/**
 * Create paginated response with metadata
 */
export function createPaginatedResponse<T>(
  data: T[],
  total: number,
  page: number,
  limit: number
) {
  const totalPages = Math.ceil(total / limit);
  const hasNextPage = page < totalPages;
  const hasPrevPage = page > 1;

  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNextPage,
      hasPrevPage,
    },
  };
}

/**
 * Standardized API error response
 */
export function createErrorResponse(error: unknown, statusCode?: number) {
  const err = handleApiError(error);
  
  return new Response(
    JSON.stringify({
      error: err.message,
      code: err.code,
    }),
    {
      status: statusCode || err.statusCode || 500,
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );
}

/**
 * Standardized API success response
 */
export function createSuccessResponse<T>(data: T, statusCode: number = 200) {
  return new Response(
    JSON.stringify(data),
    {
      status: statusCode,
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );
}

/**
 * Check authentication and return user
 */
export async function requireAuth(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    throw new Error('Unauthorized');
  }

  return session.user;
}

/**
 * Check rate limit
 */
export async function checkRateLimit(
  request: Request,
  config: { limit: number; windowMs: number } = RATE_LIMITS.STANDARD
) {
  const identifier = getIdentifier(request);
  const result = rateLimiter.check(identifier, config.limit, config.windowMs);

  if (!result.allowed) {
    const error = new Error('Rate limit exceeded') as any;
    error.statusCode = 429;
    error.retryAfter = Math.ceil(result.resetIn / 1000);
    throw error;
  }

  return result;
}

/**
 * Wrapper for API route with common middleware
 */
export function createApiHandler(options: {
  requireAuth?: boolean;
  rateLimit?: { limit: number; windowMs: number };
  timeout?: number;
}) {
  return function <T extends (...args: any[]) => Promise<Response>>(handler: T) {
    return async (...args: any[]): Promise<Response> => {
      try {
        const request = args[0] as Request;

        // Check authentication if required
        if (options.requireAuth) {
          await requireAuth(request);
        }

        // Check rate limit if configured
        if (options.rateLimit) {
          await checkRateLimit(request, options.rateLimit);
        }

        // Execute handler with timeout
        const timeout = options.timeout || TIMEOUT_DEFAULTS.STANDARD;
        const response = await withTimeout(
          handler(...args),
          timeout,
          'api-handler'
        );

        return response;
      } catch (error) {
        if (error instanceof TimeoutError) {
          return createErrorResponse(error, 504);
        }
        return createErrorResponse(error);
      }
    };
  };
}

/**
 * Parse filter parameters from request
 */
export function getFilterParams(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const filters: Record<string, any> = {};

  for (const [key, value] of searchParams.entries()) {
    if (key !== 'page' && key !== 'limit') {
      filters[key] = value;
    }
  }

  return filters;
}

/**
 * Validate required fields
 */
export function validateRequired<T extends Record<string, any>>(
  data: T,
  requiredFields: (keyof T)[]
): void {
  const missing = requiredFields.filter(field => !data[field]);
  
  if (missing.length > 0) {
    const error = new Error(`Missing required fields: ${missing.join(', ')}`) as any;
    error.statusCode = 400;
    throw error;
  }
}
