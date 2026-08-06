
/**
 * Role Management Dialog Component
 */

'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { UserCog } from 'lucide-react';
import type { User, RoleFormData } from '../types';
import { formatRoleLabel } from '../utils/userUtils';

interface RoleDialogProps {
  user: User | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (formData: RoleFormData) => Promise<void>;
}

export function RoleDialog({ user, open, onOpenChange, onSubmit }: RoleDialogProps) {
  const [formData, setFormData] = useState<RoleFormData>({
    role: ''
  });
  const [submitting, setSubmitting] = useState(false);

  // Update form when user changes
  useEffect(() => {
    if (user) {
      // Convert role to uppercase for the select dropdown
      setFormData({ role: user.role.toUpperCase() });
    }
  }, [user]);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await onSubmit(formData);
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  if (!user) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCog className="h-5 w-5" />
            Change User Role
          </DialogTitle>
          <DialogDescription>
            {user.name || user.email}
            <div className="mt-2 text-sm">
              Current role: <span className="font-semibold">{formatRoleLabel(user.role)}</span>
            </div>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="role">New Role</Label>
            <Select value={formData.role} onValueChange={(value) => setFormData({ role: value })}>
              <SelectTrigger id="role">
                <SelectValue placeholder="Select a role" />
              </SelectTrigger>
              <SelectContent>
                {/* Only what an admin actually decides. The two "pending" roles are
                    states the signup sets while a department account waits for approval —
                    listing them here invited an admin to put someone back into a queue
                    instead of approving or refusing them. Filter the user list by pending
                    to find those waiting. */}
                <SelectItem value="CONTRACTOR">Contractor</SelectItem>
                <SelectItem value="RAILWAY_OFFICIAL">Railway Official (approves the bill)</SelectItem>
                <SelectItem value="ACCOUNTS_OFFICIAL">Accounts / Audit (passes it for payment)</SelectItem>
                <SelectItem value="ADMIN">Admin</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              Choose Railway Official or Accounts / Audit only after verifying their official email
              and identity — both can see and act on other people&apos;s bills. To refuse a department
              account, leave it as Contractor.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button 
            variant="outline" 
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? 'Updating...' : 'Update Role'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
