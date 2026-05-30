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
import { getClientRoleInfo } from '@/lib/role-auth';

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
  DeleteUserDialog
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
      <div className="flex flex-col items-center justify-center min-h-[60vh] relative overflow-hidden bg-slate-950/20 rounded-3xl border border-slate-100/10 backdrop-blur-md p-8">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-violet-600/15 blur-[80px] rounded-full animate-pulse" />
        <div className="absolute top-1/3 left-1/3 w-48 h-48 bg-cyan-600/10 blur-[100px] rounded-full animate-pulse delay-700" />
        <div className="relative text-center space-y-4">
          <div className="relative inline-flex items-center justify-center p-4 bg-gradient-to-tr from-violet-600 to-indigo-600 rounded-2xl shadow-xl shadow-indigo-500/10 animate-bounce">
            <Users className="h-8 w-8 text-white" />
          </div>
          <h2 className="text-xl font-bold bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">Securing Directory...</h2>
          <p className="text-sm text-slate-400 max-w-xs mx-auto animate-pulse">Loading system user credentials and account balances.</p>
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
      <div className="absolute top-0 right-10 w-96 h-96 bg-violet-600/10 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute top-1/3 -left-20 w-80 h-80 bg-cyan-600/8 blur-[100px] rounded-full pointer-events-none" />
      <div className="absolute bottom-10 right-20 w-[450px] h-[450px] bg-emerald-600/5 blur-[150px] rounded-full pointer-events-none" />

      {/* Header Container */}
      <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-6 p-8 bg-gradient-to-r from-slate-900/60 to-slate-950/60 backdrop-blur-xl border border-white/5 rounded-3xl shadow-[0_8px_32px_rgba(0,0,0,0.15)] overflow-hidden">
        <div className="absolute inset-0 bg-grid-white/[0.02] pointer-events-none" />
        <div className="relative space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 text-xs font-semibold text-violet-400 bg-violet-500/10 border border-violet-500/20 rounded-full shadow-inner">
            <Sparkles className="h-3 w-3 animate-spin" />
            Admin Operations Center
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-300 bg-clip-text text-transparent">
            User Management
          </h1>
          <p className="text-sm text-slate-400 max-w-lg">
            Configure contractor role tiers, update processing fee frameworks, and manage administrative transaction credit ledgers.
          </p>
        </div>
        
        <div className="relative flex items-center gap-3">
          <div className="p-3 bg-slate-800/60 border border-white/5 rounded-2xl text-slate-400">
            <ShieldAlert className="h-6 w-6 text-amber-500 animate-pulse" />
          </div>
          <div>
            <div className="text-xs text-slate-500 font-medium">Security Clearance</div>
            <div className="text-sm font-bold text-amber-400 tracking-wide uppercase">System Admin Access</div>
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
          <Card className="border border-white/5 bg-slate-900/40 backdrop-blur-md shadow-2xl rounded-3xl overflow-hidden">
            <CardContent className="flex flex-col items-center justify-center py-20 text-center space-y-4">
              <div className="p-4 bg-slate-800/50 border border-white/5 rounded-2xl text-slate-400">
                <Users className="h-10 w-10 text-slate-500" />
              </div>
              <div className="space-y-1">
                <h3 className="text-xl font-bold text-slate-200">No users directory matches</h3>
                <p className="text-sm text-slate-500 max-w-sm">
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
    </div>
  );
}
