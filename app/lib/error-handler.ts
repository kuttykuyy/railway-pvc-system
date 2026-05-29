
/**
 * Centralized error handling utilities
 */

export interface ApiError {
  message: string;
  code?: string;
  statusCode?: number;
  details?: any;
}

export class AppError extends Error {
  code: string;
  statusCode: number;
  details?: any;

  constructor(message: string, code: string = 'UNKNOWN_ERROR', statusCode: number = 500, details?: any) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

/**
 * Error codes and their user-friendly messages
 */
export const ERROR_MESSAGES: Record<string, string> = {
  // Authentication errors
  UNAUTHORIZED: 'You need to be logged in to perform this action.',
  FORBIDDEN: 'You do not have permission to perform this action.',
  SESSION_EXPIRED: 'Your session has expired. Please log in again.',
  
  // Database errors
  DATABASE_ERROR: 'A database error occurred. Please try again.',
  DATABASE_CONNECTION_ERROR: 'Database connection temporarily unavailable. Please try again in a moment.',
  RECORD_NOT_FOUND: 'The requested record was not found.',
  DUPLICATE_ENTRY: 'This entry already exists.',
  
  // Validation errors
  VALIDATION_ERROR: 'Please check your input and try again.',
  MISSING_FIELDS: 'Required fields are missing.',
  INVALID_FORMAT: 'The format of your input is invalid.',
  INVALID_DATE: 'Please provide a valid date.',
  INVALID_AMOUNT: 'Please provide a valid amount.',
  
  // Business logic errors
  INSUFFICIENT_CREDITS: 'Insufficient credits. Please purchase more credits.',
  FREE_TRIAL_EXHAUSTED: 'Your free trial has been exhausted. Please purchase credits.',
  PAYMENT_REQUIRED: 'Payment is required to process this bill.',
  PAYMENT_FAILED: 'Payment processing failed. Please try again.',
  
  // Price index errors
  INDEX_NOT_FOUND: 'Required price indices not found for the specified month.',
  BASE_INDEX_NOT_FOUND: 'Base month index values are missing.',
  PROVISIONAL_INDEX: 'Some indices are provisional. Final PVC may vary.',
  
  // Contract/Bill errors
  CONTRACT_NOT_FOUND: 'Contract not found.',
  BILL_NOT_FOUND: 'Bill not found.',
  CLASSIFICATION_NOT_FOUND: 'Work classification not found.',
  INVALID_QUARTER: 'Invalid quarter format.',
  
  // File errors
  FILE_UPLOAD_ERROR: 'Failed to upload file. Please try again.',
  FILE_NOT_FOUND: 'File not found.',
  FILE_TOO_LARGE: 'File size exceeds the maximum limit.',
  
  // Generic errors
  UNKNOWN_ERROR: 'An unexpected error occurred. Please try again.',
  SERVER_ERROR: 'Server error occurred. Our team has been notified.',
  NETWORK_ERROR: 'Network error. Please check your connection and try again.',
};

/**
 * Check if error is a database connection error
 */
export function isDatabaseConnectionError(error: any): boolean {
  if (!error) return false;
  
  const errorMessage = error.message?.toLowerCase() || '';
  const errorCode = error.code || '';
  
  // Prisma connection error codes
  const connectionErrorCodes = ['P1001', 'P1002', 'P1008', 'P1017', 'P2024'];
  
  if (connectionErrorCodes.includes(errorCode)) {
    return true;
  }
  
  // Check error message patterns
  const connectionPatterns = [
    'connection terminated',
    'idle-session timeout',
    'terminating connection',
    'connection to server',
    'connection closed',
    'server closed the connection',
    'connection lost',
    'connection refused',
    'etimedout',
    'econnrefused',
    'econnreset',
    'epipe',
  ];
  
  return connectionPatterns.some(pattern => errorMessage.includes(pattern));
}

/**
 * Get user-friendly error message from error code or error object
 */
export function getErrorMessage(error: any): string {
  // If it's an AppError instance
  if (error instanceof AppError) {
    return error.message || ERROR_MESSAGES[error.code] || ERROR_MESSAGES.UNKNOWN_ERROR;
  }
  
  // If it's an API response with error code
  if (error?.code && ERROR_MESSAGES[error.code]) {
    return ERROR_MESSAGES[error.code];
  }
  
  // If it has a message property
  if (error?.message) {
    return error.message;
  }
  
  // If it's a string
  if (typeof error === 'string') {
    return error;
  }
  
  // Default fallback
  return ERROR_MESSAGES.UNKNOWN_ERROR;
}

/**
 * Handle API errors and return appropriate response
 */
export function handleApiError(error: any): { message: string; code: string; statusCode: number } {
  console.error('API Error:', error);
  
  // Check for connection errors first (most critical)
  if (isDatabaseConnectionError(error)) {
    console.error('❌ Database connection error detected in API route');
    return {
      message: ERROR_MESSAGES.DATABASE_CONNECTION_ERROR,
      code: 'DATABASE_CONNECTION_ERROR',
      statusCode: 503, // Service Unavailable
    };
  }
  
  // AppError instance
  if (error instanceof AppError) {
    return {
      message: error.message,
      code: error.code,
      statusCode: error.statusCode,
    };
  }
  
  // Prisma errors
  if (error?.code === 'P2002') {
    return {
      message: 'A record with this value already exists.',
      code: 'DUPLICATE_ENTRY',
      statusCode: 409,
    };
  }
  
  if (error?.code === 'P2025') {
    return {
      message: 'Record not found.',
      code: 'RECORD_NOT_FOUND',
      statusCode: 404,
    };
  }
  
  // Generic database error
  if (error?.code?.startsWith('P')) {
    return {
      message: 'A database error occurred.',
      code: 'DATABASE_ERROR',
      statusCode: 500,
    };
  }
  
  // Default error
  return {
    message: error?.message || 'An unexpected error occurred.',
    code: 'UNKNOWN_ERROR',
    statusCode: 500,
  };
}

/**
 * Client-side error handler for API calls
 */
export async function handleClientError(error: any, defaultMessage?: string): Promise<string> {
  // Network errors
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return ERROR_MESSAGES.NETWORK_ERROR;
  }
  
  // Try to parse error response
  try {
    if (error?.response) {
      const data = await error.response.json();
      return data.error || data.message || defaultMessage || ERROR_MESSAGES.UNKNOWN_ERROR;
    }
  } catch (e) {
    // Failed to parse error response
  }
  
  return getErrorMessage(error) || defaultMessage || ERROR_MESSAGES.UNKNOWN_ERROR;
}

/**
 * Format error for display in toast
 */
export function formatErrorForToast(error: any): string {
  const message = getErrorMessage(error);
  // Limit length for toast
  return message.length > 200 ? message.substring(0, 197) + '...' : message;
}

/**
 * Check if error is a temporary/retryable error
 */
export function isRetryableError(error: any): boolean {
  const retryableCodes = ['NETWORK_ERROR', 'SERVER_ERROR', 'DATABASE_ERROR', 'DATABASE_CONNECTION_ERROR'];
  
  // Connection errors are always retryable
  if (isDatabaseConnectionError(error)) {
    return true;
  }
  
  if (error instanceof AppError) {
    return retryableCodes.includes(error.code);
  }
  
  if (error?.code) {
    return retryableCodes.includes(error.code);
  }
  
  // Network errors are retryable
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return true;
  }
  
  return false;
}
