
import { useState, useCallback } from 'react';
import { api } from '@/lib/api-client';
import { getErrorMessage } from '@/lib/error-handler';
import toast from 'react-hot-toast';

interface UseApiOptions {
  onSuccess?: (data: any) => void;
  onError?: (error: any) => void;
  showSuccessToast?: boolean;
  showErrorToast?: boolean;
  successMessage?: string;
}

interface UseApiState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

export function useApi<T = any>(options: UseApiOptions = {}) {
  const {
    onSuccess,
    onError,
    showSuccessToast = false,
    showErrorToast = true,
    successMessage = 'Operation successful',
  } = options;

  const [state, setState] = useState<UseApiState<T>>({
    data: null,
    loading: false,
    error: null,
  });

  const execute = useCallback(
    async (apiCall: () => Promise<T>) => {
      setState((prev) => ({ ...prev, loading: true, error: null }));

      try {
        const result = await apiCall();
        setState({ data: result, loading: false, error: null });

        if (showSuccessToast) {
          toast.success(successMessage);
        }

        onSuccess?.(result);
        return result;
      } catch (err: any) {
        const errorMessage = getErrorMessage(err);
        setState((prev) => ({ ...prev, loading: false, error: errorMessage }));

        if (showErrorToast) {
          toast.error(errorMessage);
        }

        onError?.(err);
        throw err;
      }
    },
    [onSuccess, onError, showSuccessToast, showErrorToast, successMessage]
  );

  const reset = useCallback(() => {
    setState({ data: null, loading: false, error: null });
  }, []);

  return {
    ...state,
    execute,
    reset,
  };
}

/**
 * Hook for fetching data with automatic loading and error states
 */
export function useFetch<T = any>(
  url: string,
  options: UseApiOptions & { auto?: boolean } = {}
) {
  const { auto = false, ...apiOptions } = options;
  const apiState = useApi<T>(apiOptions);

  const fetch = useCallback(
    async (fetchOptions?: RequestInit) => {
      return apiState.execute(() => api.get<T>(url, fetchOptions));
    },
    [url, apiState]
  );

  // Auto-fetch on mount if auto is true
  useState(() => {
    if (auto) {
      fetch();
    }
  });

  return {
    ...apiState,
    fetch,
    refetch: fetch,
  };
}

/**
 * Hook for mutations (POST, PUT, DELETE) with loading and error states
 */
export function useMutation<TData = any, TVariables = any>(
  options: UseApiOptions = {}
) {
  const apiState = useApi<TData>(options);

  const mutate = useCallback(
    async (variables: TVariables, mutationFn: (vars: TVariables) => Promise<TData>) => {
      return apiState.execute(() => mutationFn(variables));
    },
    [apiState]
  );

  return {
    ...apiState,
    mutate,
  };
}
