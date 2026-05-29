
/**
 * Type definitions for Admin Users Management
 */

export interface User {
  id: string;
  name: string | null;
  email: string;
  phone: string | null;
  emailVerified: string | null;
  role: string;
  totalBillsProcessed: number;
  freeTrialUsed: number;
  isTrialActive: boolean;
  customProcessingFee: number | null;
  isFreeAccount: boolean;
  createdAt: string;
  customerAccount: {
    creditBalance: number;
    currentTier: string;
    monthlyBillCount: number;
    status: string;
  } | null;
}

export interface CreditTransaction {
  id: string;
  amount: number;
  type: string;
  reason: string;
  balanceBefore: number;
  balanceAfter: number;
  adminUserId: string | null;
  adminUserEmail: string | null;
  billId: string | null;
  createdAt: string;
}

export interface CreditFormData {
  amount: string;
  type: 'add' | 'deduct';
  reason: string;
}

export interface ProcessingFeeFormData {
  isFreeAccount: boolean;
  customProcessingFee: string;
}

export interface RoleFormData {
  role: string;
}

export interface UserStats {
  totalUsers: number;
  activeUsers: number;
  totalCredits: number;
  freeAccounts: number;
  trialUsers: number;
}

export interface UserFilters {
  searchQuery: string;
  roleFilter: string;
  accountTypeFilter: string;
}
