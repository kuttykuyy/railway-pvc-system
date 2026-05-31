import { logger } from './logger';

/**
 * Payment Retry Utility
 * Provides robust error handling and retry logic for payment operations
 */

export interface RetryConfig {
  maxRetries: number;
  baseDelay: number; // in milliseconds
  maxDelay: number; // in milliseconds
  timeout: number; // in milliseconds
  retryableStatuses: number[];
  retryableErrorCodes: string[];
}

export interface RetryAttempt {
  attemptNumber: number;
  totalAttempts: number;
  nextRetryDelay?: number;
  error: any;
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 10000,
  timeout: 20000,
  retryableStatuses: [408, 429, 500, 502, 503, 504],
  retryableErrorCodes: [
    'RAZORPAY_API_ERROR',
    'DB_ERROR',
    'NETWORK_ERROR',
    'TIMEOUT_ERROR'
  ]
};

export class PaymentError extends Error {
  constructor(
    message: string,
    public code: string,
    public status?: number,
    public details?: string,
    public retryable: boolean = false
  ) {
    super(message);
    this.name = 'PaymentError';
  }
}

/**
 * Calculate exponential backoff delay with jitter
 */
export function calculateBackoff(
  attemptNumber: number,
  baseDelay: number,
  maxDelay: number
): number {
  // Exponential backoff: baseDelay * (2 ^ attemptNumber)
  const exponentialDelay = baseDelay * Math.pow(2, attemptNumber);
  
  // Add jitter (±20% randomization) to prevent thundering herd
  const jitter = exponentialDelay * 0.2 * (Math.random() * 2 - 1);
  
  // Cap at maxDelay
  const delay = Math.min(exponentialDelay + jitter, maxDelay);
  
  return Math.floor(delay);
}

/**
 * Check if error is retryable
 */
export function isRetryableError(
  error: any,
  config: RetryConfig
): boolean {
  // Check HTTP status codes
  if (error.status && config.retryableStatuses.includes(error.status)) {
    return true;
  }
  
  // Check error codes
  if (error.code && config.retryableErrorCodes.includes(error.code)) {
    return true;
  }
  
  // Check error types
  if (error.name === 'AbortError' || error.name === 'TimeoutError') {
    return true;
  }
  
  // Check fetch errors
  if (error.message?.toLowerCase().includes('network')) {
    return true;
  }
  
  if (error.message?.toLowerCase().includes('fetch')) {
    return true;
  }
  
  return false;
}

/**
 * Log retry attempt details
 */
export function logRetryAttempt(
  operation: string,
  attempt: RetryAttempt
): void {
  const timestamp = new Date().toISOString();
  const logData = {
    timestamp,
    operation,
    attemptNumber: attempt.attemptNumber,
    totalAttempts: attempt.totalAttempts,
    nextRetryDelay: attempt.nextRetryDelay,
    errorCode: attempt.error?.code,
    errorMessage: attempt.error?.message,
    errorStatus: attempt.error?.status,
    errorDetails: attempt.error?.details
  };
  
  logger.warn(`[Payment Retry] ${operation} - Attempt ${attempt.attemptNumber}/${attempt.totalAttempts}`, logData);
}

/**
 * Create a fetch request with timeout
 */
export async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeout: number
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new PaymentError(
        'Request timeout',
        'TIMEOUT_ERROR',
        undefined,
        `Request took longer than ${timeout}ms`,
        true
      );
    }
    throw error;
  }
}

/**
 * Parse error response from API
 */
export async function parseErrorResponse(response: Response): Promise<PaymentError> {
  let errorData: any = {};
  
  try {
    errorData = await response.json();
  } catch (e) {
    // If JSON parsing fails, use status text
    errorData = {
      error: response.statusText || 'Unknown error',
      code: 'UNKNOWN_ERROR'
    };
  }
  
  const retryable = isRetryableError(
    { status: response.status, code: errorData.code },
    DEFAULT_RETRY_CONFIG
  );
  
  return new PaymentError(
    errorData.error || 'Payment request failed',
    errorData.code || 'UNKNOWN_ERROR',
    response.status,
    errorData.details,
    retryable
  );
}

/**
 * Get user-friendly error message
 */
export function getUserFriendlyMessage(error: PaymentError): string {
  const errorMessages: Record<string, string> = {
    'PAYMENT_DISABLED': 'Payment system is temporarily disabled. Please contact support.',
    'PAYMENT_NOT_CONFIGURED': 'Payment system is not configured. Please contact support.',
    'RAZORPAY_API_ERROR': 'Payment gateway is temporarily unavailable. Please try again.',
    'DB_ERROR': 'Database connection error. Please try again.',
    'NETWORK_ERROR': 'Network connection error. Please check your internet connection.',
    'TIMEOUT_ERROR': 'Request timeout. Please check your connection and try again.',
    'AUTH_REQUIRED': 'Authentication required. Please sign in again.',
    'INVALID_SESSION': 'Invalid payment session. Please refresh the page.',
    'ALREADY_PAID': 'This session has already been paid.',
    'INTERNAL_ERROR': 'An unexpected error occurred. Please try again later.'
  };
  
  // Check for 503 Service Unavailable
  if (error.status === 503) {
    return 'Payment service is temporarily unavailable due to high load or maintenance. Please try again in a few moments.';
  }
  
  return errorMessages[error.code] || error.message || 'An error occurred. Please try again.';
}

/**
 * Retry with exponential backoff
 */
export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  operationName: string,
  config: RetryConfig = DEFAULT_RETRY_CONFIG,
  onRetry?: (attempt: RetryAttempt) => void
): Promise<T> {
  let lastError: any;
  
  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      // Log the attempt
      if (attempt > 0) {
        logger.log(`[Payment Retry] ${operationName} - Attempt ${attempt + 1}/${config.maxRetries + 1}`);
      }
      
      const result = await operation();
      
      // Success - log and return
      if (attempt > 0) {
        logger.log(`[Payment Retry] ${operationName} - Succeeded after ${attempt} retries`);
      }
      
      return result;
    } catch (error: any) {
      lastError = error;
      
      // If this was the last attempt, throw the error
      if (attempt === config.maxRetries) {
        console.error(`[Payment Retry] ${operationName} - All ${config.maxRetries + 1} attempts failed`, {
          finalError: {
            code: error.code,
            message: error.message,
            status: error.status,
            details: error.details
          }
        });
        throw error;
      }
      
      // Check if error is retryable
      if (!isRetryableError(error, config)) {
        console.error(`[Payment Retry] ${operationName} - Non-retryable error`, {
          code: error.code,
          message: error.message,
          status: error.status
        });
        throw error;
      }
      
      // Calculate backoff delay
      const delay = calculateBackoff(attempt, config.baseDelay, config.maxDelay);
      
      // Prepare retry attempt info
      const retryAttempt: RetryAttempt = {
        attemptNumber: attempt + 1,
        totalAttempts: config.maxRetries + 1,
        nextRetryDelay: delay,
        error
      };
      
      // Log retry attempt
      logRetryAttempt(operationName, retryAttempt);
      
      // Call retry callback if provided
      if (onRetry) {
        onRetry(retryAttempt);
      }
      
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  // This should never be reached, but just in case
  throw lastError;
}

