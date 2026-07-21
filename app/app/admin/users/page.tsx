/**
 * Admin Users Management Page
 * Manages user accounts, credits, roles, and permissions
 */

'use client';

import { useState, useMemo, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Users, ShieldAlert, Sparkles, UserPlus } from 'lucide-react';
import { getClientRoleInfo } from '@/lib/role-auth-client';

// Import custom hooks
import { useUsers } from './hooks/useUsers';
import { useCreditManagement } from './hooks/useCreditManagement';

// Import components
import {
  UserStatsCards,
  UserFilters,
  UserCard,
  CreditDialog,
  CreditHistoryDialog,
  ProcessingFeeDialog,
  RoleDialog,
  DeleteUserDialog,
  ContractLimitDialog,
} from './components';

// Import utilities and types
import { calculateUserStats, filterUsers } from './utils/userUtils';
import type { User, CreditFormData, ProcessingFeeFormData, RoleFormData } from './types';

export default function AdminUsersPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  // Custom hooks
  const { users, loading, fetchUsers, deleteUser, updateUserRole, updateProcessingFee } = useUsers();
  const { transactions, loadingTransactions, fetchCreditHistory, addOrDeductCredits } = useCreditManagement();

  // Dialog state
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [creditDialogOpen, setCreditDialogOpen] = useState(false);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [processingFeeDialogOpen, setProcessingFeeDialogOpen] = useState(false);
  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [contractLimitDialogOpen, setContractLimitDialogOpen] = useState(false);
  const [deletingUser, setDeletingUser] = useState(false);

  // Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [accountTypeFilter, setAccountTypeFilter] = useState<string>('all');

  // Check if user is admin
  const { isAdmin } = getClientRoleInfo(session);

  // Calculate filtered users and stats
  const filteredUsers = useMemo(
    () => filterUsers(users, searchQuery, roleFilter, accountTypeFilter),
    [users, searchQuery, roleFilter, accountTypeFilter]
  );

  const stats = useMemo(
    () => calculateUserStats(users),
    [users]
  );

  // Redirect if not admin
  useEffect(() => {
    if (status === 'loading') return;
    if (!session || !isAdmin) {
      router.push('/dashboard');
    }
  }, [session, status, isAdmin, router]);

  // Dialog handlers
  const openCreditDialog = (user: User) => {
    setSelectedUser(user);
    setCreditDialogOpen(true);
  };

  const openHistoryDialog = async (user: User) => {
    setSelectedUser(user);
    setHistoryDialogOpen(true);
    await fetchCreditHistory(user.id);
  };

  const openProcessingFeeDialog = (user: User) => {
    setSelectedUser(user);
    setProcessingFeeDialogOpen(true);
  };

  const openRoleDialog = (user: User) => {
    setSelectedUser(user);
    setRoleDialogOpen(true);
  };

  const openDeleteDialog = (user: User) => {
    setSelectedUser(user);
    setDeleteDialogOpen(true);
  };

  const openContractLimitDialog = (user: User) => {
    setSelectedUser(user);
    setContractLimitDialogOpen(true);
  };

  const handleContractLimitSubmit = async (userId: string, contractLimitOverride: number | null) => {
    await fetch(`/api/admin/users/${userId}/contract-limit`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contractLimitOverride }),
    });
    await fetchUsers();
  };

  // Form submission handlers
  const handleCreditSubmit = async (formData: CreditFormData) => {
    if (!selectedUser) return;
    
    const success = await addOrDeductCredits(selectedUser.id, formData);
    if (success) {
      await fetchUsers(); // Refresh user list
      setCreditDialogOpen(false);
    }
  };

  const handleProcessingFeeSubmit = async (formData: ProcessingFeeFormData) => {
    if (!selectedUser) return;
    
    const customFee = formData.customProcessingFee ? parseFloat(formData.customProcessingFee) : null;
    const success = await updateProcessingFee(selectedUser.id, formData.isFreeAccount, customFee);
    
    if (success) {
      await fetchUsers(); // Refresh list to reflect fee updates
      setProcessingFeeDialogOpen(false);
    }
  };

  const handleRoleSubmit = async (formData: RoleFormData) => {
    if (!selectedUser) return;
    
    const success = await updateUserRole(selectedUser.id, formData.role);
    
    if (success) {
      await fetchUsers(); // Refresh list to reflect role updates
      setRoleDialogOpen(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!selectedUser) return;
    
    setDeletingUser(true);
    const success = await deleteUser(selectedUser.id);
    setDeletingUser(false);
    
    if (success) {
      setDeleteDialogOpen(false);
      setSelectedUser(null);
    }
  };

  // Loading state
  if (status === 'loading' || loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] relative overflow-hidden bg-white/70 rounded-3xl border border-slate-100 shadow-[0_15px_35px_rgba(0,0,0,0.02)] backdrop-blur-md p-8">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-emerald-600/10 blur-[80px] rounded-full animate-pulse" />
        <div className="absolute top-1/3 left-1/3 w-48 h-48 bg-emerald-600/8 blur-[100px] rounded-full animate-pulse delay-700" />
        <div className="relative text-center space-y-4">
          <div className="relative inline-flex items-center justify-center p-4 bg-gradient-to-tr from-emerald-600 to-emerald-600 rounded-2xl shadow-xl shadow-emerald-500/20 animate-bounce">
            <Users className="h-8 w-8 text-white" />
          </div>
          <h2 className="text-xl font-bold bg-gradient-to-r from-slate-900 via-emerald-950 to-slate-900 bg-clip-text text-transparent">Securing Directory...</h2>
          <p className="text-sm text-slate-500 max-w-xs mx-auto animate-pulse">Loading system user credentials and account balances.</p>
        </div>
      </div>
    );
  }

  // Not authorized
  if (!isAdmin) {
    return null;
  }

  return (
    <div className="relative min-h-screen pb-12 space-y-8 overflow-hidden">
      {/* Dynamic Background Blurs */}
      <div className="absolute top-0 right-10 w-96 h-96 bg-emerald-300/10 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute top-1/3 -left-20 w-80 h-80 bg-emerald-300/10 blur-[100px] rounded-full pointer-events-none" />
      <div className="absolute bottom-10 right-20 w-[450px] h-[450px] bg-emerald-300/5 blur-[150px] rounded-full pointer-events-none" />

      {/* Header Container */}
      <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-6 p-8 bg-white/80 backdrop-blur-xl border border-slate-200/50 rounded-3xl shadow-[0_10px_40px_rgba(0,0,0,0.03)] overflow-hidden">
        <div className="absolute inset-0 bg-grid-slate-900/[0.01] pointer-events-none" />
        <div className="relative space-y-2">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200/50 rounded-full shadow-sm">
            <Sparkles className="h-3 w-3 animate-spin text-emerald-600" />
            Admin Operations Center
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight bg-gradient-to-r from-slate-900 via-emerald-950 to-slate-900 bg-clip-text text-transparent">
            User Management
          </h1>
          <p className="text-sm text-slate-500 max-w-lg font-normal">
            Configure contractor role tiers, update processing fee frameworks, and manage administrative transaction credit ledgers.
          </p>
        </div>
        
        <div className="relative flex items-center gap-3 bg-slate-50/60 border border-slate-100 rounded-2xl p-3">
          <div className="p-2.5 bg-amber-50 border border-amber-100 rounded-xl text-slate-400">
            <ShieldAlert className="h-5 w-5 text-amber-600 animate-pulse" />
          </div>
          <div>
            <div className="text-[10px] text-slate-400 font-medium">Security Clearance</div>
            <div className="text-xs font-black text-amber-600 tracking-wide uppercase">System Admin Access</div>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <UserStatsCards stats={stats} />

      {/* Filter and User Grid Backdrop */}
      <div className="space-y-6">
        <UserFilters
          searchQuery={searchQuery}
          roleFilter={roleFilter}
          accountTypeFilter={accountTypeFilter}
          onSearchChange={setSearchQuery}
          onRoleFilterChange={setRoleFilter}
          onAccountTypeFilterChange={setAccountTypeFilter}
        />

        {/* Users List */}
        {filteredUsers.length === 0 ? (
          <Card className="border border-slate-100 bg-white/70 backdrop-blur-md shadow-[0_15px_35px_rgba(0,0,0,0.02)] rounded-3xl overflow-hidden">
            <CardContent className="flex flex-col items-center justify-center py-20 text-center space-y-4">
              <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl text-slate-400">
                <Users className="h-10 w-10 text-slate-400" />
              </div>
              <div className="space-y-1">
                <h3 className="text-xl font-bold text-slate-800">No users directory matches</h3>
                <p className="text-sm text-slate-500 max-w-sm font-light">
                  {searchQuery || roleFilter !== 'all' || accountTypeFilter !== 'all'
                    ? 'No contractors or officials match your active system filters.'
                    : 'The user database directory is currently empty.'}
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-5">
            {filteredUsers.map((user) => (
              <UserCard
                key={user.id}
                user={user}
                onOpenCreditDialog={openCreditDialog}
                onOpenHistoryDialog={openHistoryDialog}
                onOpenProcessingFeeDialog={openProcessingFeeDialog}
                onOpenRoleDialog={openRoleDialog}
                onOpenDeleteDialog={openDeleteDialog}
                onOpenContractLimitDialog={openContractLimitDialog}
              />
            ))}
          </div>
        )}
      </div>

      {/* Dialogs */}
      <CreditDialog
        user={selectedUser}
        open={creditDialogOpen}
        onOpenChange={setCreditDialogOpen}
        onSubmit={handleCreditSubmit}
      />

      <CreditHistoryDialog
        user={selectedUser}
        transactions={transactions}
        loading={loadingTransactions}
        open={historyDialogOpen}
        onOpenChange={setHistoryDialogOpen}
      />

      <ProcessingFeeDialog
        user={selectedUser}
        open={processingFeeDialogOpen}
        onOpenChange={setProcessingFeeDialogOpen}
        onSubmit={handleProcessingFeeSubmit}
      />

      <RoleDialog
        user={selectedUser}
        open={roleDialogOpen}
        onOpenChange={setRoleDialogOpen}
        onSubmit={handleRoleSubmit}
      />

      <DeleteUserDialog
        user={selectedUser}
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleDeleteUser}
        deleting={deletingUser}
      />

      <ContractLimitDialog
        user={selectedUser}
        open={contractLimitDialogOpen}
        onOpenChange={setContractLimitDialogOpen}
        onSubmit={handleContractLimitSubmit}
      />
    </div>
  );
}
