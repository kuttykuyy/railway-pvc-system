/**
 * Admin Users Management Page
 * Manages user accounts, credits, roles, and permissions
 */

'use client';

import { useState, useMemo, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Users } from 'lucide-react';
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
      setProcessingFeeDialogOpen(false);
    }
  };

  const handleRoleSubmit = async (formData: RoleFormData) => {
    if (!selectedUser) return;
    
    const success = await updateUserRole(selectedUser.id, formData.role);
    
    if (success) {
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
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4 animate-pulse" />
          <p className="text-muted-foreground">Loading users...</p>
        </div>
      </div>
    );
  }

  // Not authorized
  if (!isAdmin) {
    return null;
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">User Management</h1>
        <p className="text-muted-foreground">Manage users, credits, and permissions</p>
      </div>

      {/* Stats Cards */}
      <UserStatsCards stats={stats} />

      {/* Filters */}
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
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Users className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No users found</h3>
            <p className="text-sm text-muted-foreground text-center">
              {searchQuery || roleFilter !== 'all' || accountTypeFilter !== 'all'
                ? 'Try adjusting your search or filters'
                : 'No users have been registered yet'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
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
