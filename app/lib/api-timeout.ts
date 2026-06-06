
/**
 * API Timeout Protection Utility
 * Prevents long-running requests from hanging indefinitely
 */

export class TimeoutError extends Error {
  constructor(operation: string, timeout: number) {
    super(`Operation '${operation}' timed out after ${timeout}ms`);
    this.name = 'TimeoutError';
  }
}

/**
 * Wrap a promise with timeout protection
 * @param promise The promise to wrap
 * @param timeoutMs Timeout in milliseconds
 * @param operationName Name of the operation for error messages
 * @returns Promise that rejects if timeout is exceeded
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operationName: string = 'operation'
): Promise<T> {
  let timeoutHandle: NodeJS.Timeout;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new TimeoutError(operationName, timeoutMs));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timeoutHandle!);
    return result;
  } catch (error) {
    clearTimeout(timeoutHandle!);
    throw error;
  }
}

/**
 * Default timeout values for different operation types
 */
export const TIMEOUT_DEFAULTS = {
  QUICK: 5000,      // 5 seconds  - Simple queries, data fetches
  STANDARD: 15000,  // 15 seconds - Standard operations
  LONG: 30000,      // 30 seconds - Complex calculations
  VERY_LONG: 60000, // 60 seconds - Single PDF generation
  BULK_PDF: 300000, // 5 minutes  - Bulk PDF generation (multiple bills, DB queries, merging)
  EXTERNAL: 10000,  // 10 seconds - External API calls
} as const;

/**
 * Wrapper for API route handlers with automatic timeout protection
 */
export function withApiTimeout<T extends (...args: any[]) => Promise<any>>(
  handler: T,
  timeout: number = TIMEOUT_DEFAULTS.STANDARD,
  operationName?: string
): T {
  return (async (...args: any[]) => {
    const name = operationName || handler.name || 'api-handler';
    return withTimeout(handler(...args), timeout, name);
  }) as T;
}
