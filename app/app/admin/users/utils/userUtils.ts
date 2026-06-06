
/**
 * Utility functions for user management
 */

import type { User } from '../types';

/**
 * Format role label for display
 */
export function formatRoleLabel(role: string): string {
  switch (role?.toLowerCase()) {
    case 'admin':
      return 'Admin';
    case 'pending_railway_official':
      return 'Pending Railway Official';
    case 'railway_official':
      return 'Railway Official';
    case 'contractor':
      return 'Contractor';
    default:
      return 'Contractor';
  }
}

/**
 * Get user initials from name or email
 */
export function getUserInitials(name: string | null, email: string): string {
  if (name) {
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  }
  return email.substring(0, 2).toUpperCase();
}

/**
 * Get role badge variant based on role
 */
export function getRoleBadgeVariant(role: string): "default" | "secondary" | "destructive" | "outline" {
  switch (role?.toLowerCase()) {
    case 'admin':
      return 'destructive';
    case 'pending_railway_official':
      return 'outline';
    case 'railway_official':
      return 'default';
    case 'contractor':
      return 'secondary';
    default:
      return 'outline';
  }
}

/**
 * Get account status badge variant
 */
export function getAccountStatusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  switch (status?.toLowerCase()) {
    case 'active':
      return 'default';
    case 'suspended':
      return 'destructive';
    case 'inactive':
      return 'secondary';
    default:
      return 'outline';
  }
}

/**
 * Format currency amount
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
}

/**
 * Format date for display
 */
export function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata'
  });
}

/**
 * Calculate user statistics
 */
export function calculateUserStats(users: User[]) {
  return {
    totalUsers: users.length,
    activeUsers: users.filter(u => u.customerAccount?.status === 'active').length,
    totalCredits: users.reduce((sum, u) => sum + (u.customerAccount?.creditBalance || 0), 0),
    freeAccounts: users.filter(u => u.isFreeAccount).length,
    trialUsers: users.filter(u => u.isTrialActive).length
  };
}

/**
 * Filter users based on search and filters
 */
export function filterUsers(
  users: User[],
  searchQuery: string,
  roleFilter: string,
  accountTypeFilter: string
): User[] {
  return users.filter(user => {
    const matchesSearch = !searchQuery || 
      user.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.email.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesRole = roleFilter === 'all' || user.role === roleFilter;

    const matchesAccountType = accountTypeFilter === 'all' ||
      (accountTypeFilter === 'free' && user.isFreeAccount) ||
      (accountTypeFilter === 'paid' && !user.isFreeAccount) ||
      (accountTypeFilter === 'trial' && user.isTrialActive);

    return matchesSearch && matchesRole && matchesAccountType;
  });
}
