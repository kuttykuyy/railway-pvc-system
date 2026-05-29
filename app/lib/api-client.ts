
/**
 * Enhanced API client with error handling and retry logic
 */

import { AppError, handleClientError, isRetryableError } from './error-handler';

interface FetchOptions extends RequestInit {
  retry?: number;
  retryDelay?: number;
  timeout?: number;
}

/**
 * Enhanced fetch with timeout support
 */
async function fetchWithTimeout(url: string, options: FetchOptions = {}) {
  const { timeout = 30000, ...fetchOptions } = options;
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new AppError('Request timeout. Please try again.', 'TIMEOUT_ERROR', 408);
    }
    throw error;
  }
}

/**
 * API client with automatic retry and error handling
 */
export async function apiClient<T = any>(
  url: string,
  options: FetchOptions = {}
): Promise<T> {
  const {
    retry = 0,
    retryDelay = 1000,
    ...fetchOptions
  } = options;
  
  let lastError: any;
  
  for (let attempt = 0; attempt <= retry; attempt++) {
    try {
      const response = await fetchWithTimeout(url, fetchOptions);
      
      // Handle non-ok responses
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new AppError(
          errorData.error || errorData.message || `Request failed with status ${response.status}`,
          errorData.code || 'API_ERROR',
          response.status,
          errorData
        );
      }
      
      // Parse and return response
      const contentType = response.headers.get('content-type');
      if (contentType?.includes('application/json')) {
        return await response.json();
      }
      
      return await response.text() as any;
      
    } catch (error: any) {
      lastError = error;
      
      // Don't retry on the last attempt or if error is not retryable
      if (attempt === retry || !isRetryableError(error)) {
        throw error;
      }
      
      // Wait before retrying with exponential backoff
      await new Promise(resolve => 
        setTimeout(resolve, retryDelay * Math.pow(2, attempt))
      );
    }
  }
  
  throw lastError;
}

/**
 * Convenience methods for common HTTP verbs
 */
export const api = {
  get: <T = any>(url: string, options?: FetchOptions) =>
    apiClient<T>(url, { ...options, method: 'GET' }),
  
  post: <T = any>(url: string, data?: any, options?: FetchOptions) =>
    apiClient<T>(url, {
      ...options,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
      body: JSON.stringify(data),
    }),
  
  put: <T = any>(url: string, data?: any, options?: FetchOptions) =>
    apiClient<T>(url, {
      ...options,
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
      body: JSON.stringify(data),
    }),
  
  patch: <T = any>(url: string, data?: any, options?: FetchOptions) =>
    apiClient<T>(url, {
      ...options,
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
      body: JSON.stringify(data),
    }),
  
  delete: <T = any>(url: string, options?: FetchOptions) =>
    apiClient<T>(url, { ...options, method: 'DELETE' }),
};
