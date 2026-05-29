
/**
 * Custom hook for credit management operations
 */

'use client';

import { useState, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import type { CreditTransaction, CreditFormData } from '../types';

export function useCreditManagement() {
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  const { toast } = useToast();

  const fetchCreditHistory = useCallback(async (userId: string): Promise<boolean> => {
    try {
      setLoadingTransactions(true);
      const response = await fetch(`/api/admin/users/${userId}/credits`);

      if (!response.ok) {
        throw new Error('Failed to fetch credit history');
      }

      const data = await response.json();
      setTransactions(data.transactions || []);
      return true;
    } catch (error) {
      console.error('Error fetching credit history:', error);
      toast({
        title: 'Error',
        description: 'Failed to load credit history',
        variant: 'destructive',
      });
      return false;
    } finally {
      setLoadingTransactions(false);
    }
  }, [toast]);

  const addOrDeductCredits = useCallback(async (
    userId: string,
    formData: CreditFormData
  ): Promise<boolean> => {
    const amount = parseFloat(formData.amount);
    
    if (isNaN(amount) || amount <= 0) {
      toast({
        title: 'Invalid Amount',
        description: 'Please enter a valid positive amount',
        variant: 'destructive',
      });
      return false;
    }

    if (!formData.reason.trim()) {
      toast({
        title: 'Reason Required',
        description: 'Please provide a reason for this transaction',
        variant: 'destructive',
      });
      return false;
    }

    try {
      const response = await fetch(`/api/admin/users/${userId}/credits`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: amount,
          type: formData.type,
          reason: formData.reason.trim(),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to process credit transaction');
      }

      toast({
        title: 'Success',
        description: `Credits ${formData.type === 'add' ? 'added' : 'deducted'} successfully`,
      });

      return true;
    } catch (error) {
      console.error('Error processing credits:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to process transaction',
        variant: 'destructive',
      });
      return false;
    }
  }, [toast]);

  return {
    transactions,
    loadingTransactions,
    fetchCreditHistory,
    addOrDeductCredits
  };
}
