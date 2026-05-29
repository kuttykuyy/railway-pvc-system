
/**
 * User Card Component
 */

'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { MoreVertical, CreditCard, UserCog, Activity, History, Trash2, FileText, IndianRupee, ShieldCheck, Calendar, Phone } from 'lucide-react';
import { format } from 'date-fns';
import { toISTDate } from '@/lib/ist-utils';
import type { User } from '../types';
import {
  formatRoleLabel,
  getUserInitials,
  getRoleBadgeVariant,
  getAccountStatusVariant
} from '../utils/userUtils';

interface UserCardProps {
  user: User;
  onOpenCreditDialog: (user: User) => void;
  onOpenHistoryDialog: (user: User) => void;
  onOpenProcessingFeeDialog: (user: User) => void;
  onOpenRoleDialog: (user: User) => void;
  onOpenDeleteDialog: (user: User) => void;
}

export function UserCard({
  user,
  onOpenCreditDialog,
  onOpenHistoryDialog,
  onOpenProcessingFeeDialog,
  onOpenRoleDialog,
  onOpenDeleteDialog
}: UserCardProps) {
  const canDelete = user.role !== 'admin' && user.email !== '30prasath93@gmail.com';

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-6">
        <div className="flex items-start justify-between gap-4">
          {/* User Info Section */}
          <div className="flex items-start gap-4 flex-1">
            <Avatar className="h-12 w-12 border-2 border-primary/10">
              <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                {getUserInitials(user.name, user.email)}
              </AvatarFallback>
            </Avatar>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-lg font-semibold truncate">
                  {user.name || 'Unknown User'}
                </h3>
                <Badge variant={getRoleBadgeVariant(user.role)}>
                  {formatRoleLabel(user.role)}
                </Badge>
                {user.emailVerified && (
                  <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                    <ShieldCheck className="h-3 w-3 mr-1" />
                    Verified
                  </Badge>
                )}
              </div>
              
              <p className="text-sm text-muted-foreground mb-1 truncate">
                {user.email}
              </p>
              
              {user.phone && (
                <p className="text-sm text-muted-foreground mb-2 flex items-center gap-1">
                  <Phone className="h-3 w-3" />
                  {user.phone}
                </p>
              )}
              
              <p className="text-xs text-muted-foreground mb-3 flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                Joined {format(toISTDate(new Date(user.createdAt)), 'dd MMM yyyy')}
              </p>
              
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  <FileText className="h-3 w-3 mr-1" />
                  {user.totalBillsProcessed} bills
                </Badge>
                
                {user.isFreeAccount && (
                  <Badge variant="default" className="bg-green-600 text-xs">
                    Free Account
                  </Badge>
                )}
                
                {!user.isFreeAccount && user.customProcessingFee !== null && (
                  <Badge variant="secondary" className="text-xs">
                    Custom Fee: ₹{user.customProcessingFee}
                  </Badge>
                )}
                
                <Badge 
                  variant={getAccountStatusVariant(user.customerAccount?.status || 'inactive')}
                  className="text-xs"
                >
                  {user.customerAccount?.status || 'inactive'}
                </Badge>
              </div>
            </div>
          </div>
          
          {/* Credit Balance and Actions */}
          <div className="flex items-start gap-4">
            <div className="text-right">
              <div className="flex items-center gap-1 text-2xl font-bold text-green-600 mb-1">
                <IndianRupee className="h-5 w-5" />
                {user.customerAccount?.creditBalance?.toFixed(2) || '0.00'}
              </div>
              <div className="text-xs text-muted-foreground">Credit Balance</div>
            </div>
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onOpenRoleDialog(user)}>
                  <UserCog className="h-4 w-4 mr-2" />
                  Change Role
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onOpenCreditDialog(user)}>
                  <CreditCard className="h-4 w-4 mr-2" />
                  Manage Credits
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onOpenProcessingFeeDialog(user)}>
                  <Activity className="h-4 w-4 mr-2" />
                  Processing Fee
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onOpenHistoryDialog(user)}>
                  <History className="h-4 w-4 mr-2" />
                  View History
                </DropdownMenuItem>
                {canDelete && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem 
                      onClick={() => onOpenDeleteDialog(user)}
                      className="text-red-600 focus:text-red-600"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete User
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
