
/**
 * Custom hook for user data management
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import type { User } from '../types';

export function useUsers() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/admin/users');

      if (!response.ok) {
        throw new Error('Failed to fetch users');
      }

      const data = await response.json();
      setUsers(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error fetching users:', error);
      toast({
        title: 'Error',
        description: 'Failed to load users. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const deleteUser = useCallback(async (userId: string): Promise<boolean> => {
    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete user');
      }

      toast({
        title: 'Success',
        description: 'User deleted successfully',
      });

      // Refresh users list
      await fetchUsers();
      return true;
    } catch (error) {
      console.error('Error deleting user:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to delete user',
        variant: 'destructive',
      });
      return false;
    }
  }, [fetchUsers, toast]);

  const updateUserRole = useCallback(async (userId: string, role: string): Promise<boolean> => {
    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update role');
      }

      toast({
        title: 'Success',
        description: 'User role updated successfully',
      });

      // Refresh users list
      await fetchUsers();
      return true;
    } catch (error) {
      console.error('Error updating role:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to update role',
        variant: 'destructive',
      });
      return false;
    }
  }, [fetchUsers, toast]);

  const updateProcessingFee = useCallback(async (
    userId: string,
    isFreeAccount: boolean,
    customProcessingFee: number | null
  ): Promise<boolean> => {
    try {
      const response = await fetch(`/api/admin/users/${userId}/processing-fee`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          isFreeAccount,
          customProcessingFee: customProcessingFee !== null ? customProcessingFee : undefined
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update processing fee');
      }

      toast({
        title: 'Success',
        description: 'Processing fee updated successfully',
      });

      // Refresh users list
      await fetchUsers();
      return true;
    } catch (error) {
      console.error('Error updating processing fee:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to update processing fee',
        variant: 'destructive',
      });
      return false;
    }
  }, [fetchUsers, toast]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  return {
    users,
    loading,
    fetchUsers,
    deleteUser,
    updateUserRole,
    updateProcessingFee
  };
}
