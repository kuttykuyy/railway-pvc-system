
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
  /** Set when the server returned fewer users than exist — see fetchUsers. */
  const [truncated, setTruncated] = useState<{ shown: number; total: number } | null>(null);
  const { toast } = useToast();

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      const repairResponse = await fetch('/api/admin/users', { method: 'POST' });
      if (!repairResponse.ok) {
        console.warn('Unable to repair missing customer accounts before loading users');
      }
      const response = await fetch('/api/admin/users');

      if (!response.ok) {
        throw new Error('Failed to fetch users');
      }

      const data = await response.json();
      setUsers(Array.isArray(data) ? data : []);
      // The list is capped server-side (it is not paginated, because this screen
      // searches in the browser). A cap that hides rows without saying so reads as
      // "these are all the users" — so when it bites, say so.
      if (response.headers.get('X-Truncated') === '1') {
        setTruncated({
          shown: Number(response.headers.get('X-Returned-Count')) || (Array.isArray(data) ? data.length : 0),
          total: Number(response.headers.get('X-Total-Count')) || 0,
        });
      } else {
        setTruncated(null);
      }
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

  // railwayZone travels with the role: both department roles are scoped by it and show
  // nothing without one.
  const updateUserRole = useCallback(async (userId: string, role: string, railwayZone?: string): Promise<boolean> => {
    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, ...(railwayZone !== undefined ? { railwayZone } : {}) }),
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
    truncated,
    fetchUsers,
    deleteUser,
    updateUserRole,
    updateProcessingFee
  };
}
