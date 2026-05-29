
/**
 * Delete User Confirmation Dialog Component
 */

'use client';

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';
import type { User } from '../types';

interface DeleteUserDialogProps {
  user: User | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<void>;
  deleting: boolean;
}

export function DeleteUserDialog({
  user,
  open,
  onOpenChange,
  onConfirm,
  deleting
}: DeleteUserDialogProps) {
  if (!user) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
            <AlertTriangle className="h-5 w-5" />
            Delete User
          </DialogTitle>
          <DialogDescription>
            Are you sure you want to delete this user? This action cannot be undone.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-2">
          <p className="text-sm"><span className="font-semibold">Name:</span> {user.name || 'N/A'}</p>
          <p className="text-sm"><span className="font-semibold">Email:</span> {user.email}</p>
          <p className="text-sm"><span className="font-semibold">Role:</span> {user.role}</p>
          <p className="text-sm">
            <span className="font-semibold">Bills Processed:</span> {user.totalBillsProcessed}
          </p>
        </div>

        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <p className="text-sm text-red-800">
            <strong>Warning:</strong> Deleting this user will remove all their data,
            including contracts, bills, and transaction history.
          </p>
        </div>

        <DialogFooter>
          <Button 
            variant="outline" 
            onClick={() => onOpenChange(false)}
            disabled={deleting}
          >
            Cancel
          </Button>
          <Button 
            variant="destructive"
            onClick={onConfirm}
            disabled={deleting}
          >
            {deleting ? 'Deleting...' : 'Delete User'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
