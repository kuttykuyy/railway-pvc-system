
/**
 * User Card Component
 */

'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { MoreVertical, CreditCard, UserCog, Activity, History, Trash2, FileText, IndianRupee, ShieldCheck, Calendar, Phone, Shield } from 'lucide-react';
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
  onOpenContractLimitDialog: (user: User) => void;
}

export function UserCard({
  user,
  onOpenCreditDialog,
  onOpenHistoryDialog,
  onOpenProcessingFeeDialog,
  onOpenRoleDialog,
  onOpenDeleteDialog,
  onOpenContractLimitDialog,
}: UserCardProps) {
  const canDelete = user.role !== 'admin' && user.email !== '30prasath93@gmail.com';

  // Get dynamic avatar ring colors based on user role
  const getAvatarRingClass = (role: string) => {
    switch (role?.toLowerCase()) {
      case 'superadmin':
        return 'ring-2 ring-purple-500/30 shadow-[0_0_10px_rgba(168,85,247,0.15)]';
      case 'admin':
        return 'ring-2 ring-indigo-500/25 shadow-[0_0_8px_rgba(99,102,241,0.1)]';
      case 'railway_official':
        return 'ring-2 ring-cyan-500/25 shadow-[0_0_8px_rgba(6,182,212,0.1)]';
      default: // contractor
        return 'ring-2 ring-teal-500/20';
    }
  };

  const getAvatarFallbackClass = (role: string) => {
    switch (role?.toLowerCase()) {
      case 'superadmin':
        return 'bg-purple-50 text-purple-700 border border-purple-200/50';
      case 'admin':
        return 'bg-indigo-50 text-indigo-700 border border-indigo-200/50';
      case 'railway_official':
        return 'bg-cyan-50 text-cyan-700 border border-cyan-200/50';
      default: // contractor
        return 'bg-teal-50 text-teal-700 border border-teal-200/50';
    }
  };

  return (
    <Card className="group relative overflow-hidden border border-slate-100 bg-white/75 backdrop-blur-md shadow-[0_15px_35px_rgba(0,0,0,0.015)] rounded-3xl transition-all duration-300 transform hover:-translate-y-1 hover:border-slate-200 hover:shadow-lg">
      {/* Background glow hover animation */}
      <div className="absolute inset-0 bg-gradient-to-r from-violet-600/0 via-indigo-600/0 to-cyan-600/0 group-hover:from-violet-600/1 group-hover:via-indigo-600/1 group-hover:to-cyan-600/1 transition-all duration-500 pointer-events-none" />
      
      <CardContent className="p-6 relative z-10">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          {/* User Info Section */}
          <div className="flex items-start gap-4 flex-1 min-w-0">
            <Avatar className={`h-14 w-14 transition-all duration-300 group-hover:scale-105 ${getAvatarRingClass(user.role)}`}>
              <AvatarFallback className={`font-black tracking-wider ${getAvatarFallbackClass(user.role)}`}>
                {getUserInitials(user.name, user.email)}
              </AvatarFallback>
            </Avatar>
            
            <div className="flex-1 min-w-0 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-lg font-bold text-slate-800 truncate transition-colors">
                  {user.name || 'Unknown User'}
                </h3>
                <Badge variant="outline" className="text-xs bg-slate-50 border-slate-200 font-semibold text-slate-600 py-0.5 rounded-lg">
                  {formatRoleLabel(user.role)}
                </Badge>
                {user.emailVerified && (
                  <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200/60 text-[10px] font-semibold rounded-lg">
                    <ShieldCheck className="h-3 w-3 mr-1" />
                    Verified
                  </Badge>
                )}
              </div>
              
              <div className="space-y-1">
                <p className="text-sm text-slate-500 font-medium truncate leading-none">
                  {user.email}
                </p>
                
                {user.phone && (
                  <p className="text-xs text-slate-500 font-medium flex items-center gap-1.5">
                    <Phone className="h-3 w-3 text-slate-500" />
                    {user.phone}
                  </p>
                )}
              </div>
              
              <div className="flex flex-wrap items-center gap-2 pt-1.5">
                <Badge variant="outline" className="text-[10px] font-medium border-slate-100 bg-slate-50 text-slate-600 rounded-lg">
                  <FileText className="h-3 w-3 mr-1 text-slate-400" />
                  {user.totalBillsProcessed} bills
                </Badge>

                <Badge variant="outline" className="text-[10px] font-medium border-slate-100 bg-slate-50 text-slate-600 rounded-lg">
                  <Calendar className="h-3 w-3 mr-1 text-slate-400" />
                  {format(toISTDate(new Date(user.createdAt)), 'dd MMM yyyy')}
                </Badge>
                
                {(user.role === 'railway_official' || user.role === 'RAILWAY_OFFICIAL') && (
                  <Badge variant="default" className="bg-cyan-50 border border-cyan-200 text-cyan-700 text-[10px] font-bold hover:bg-cyan-100 rounded-lg px-2.5 py-0.5">
                    Railway Official (Free)
                  </Badge>
                )}
                {(user.role === 'railway_official' || user.role === 'RAILWAY_OFFICIAL') && user.contractLimitOverride !== null && user.contractLimitOverride !== undefined && (
                  <Badge variant="outline" className="bg-amber-50 border border-amber-200 text-amber-700 text-[10px] font-bold rounded-lg px-2.5 py-0.5">
                    <FolderOpen className="h-3 w-3 mr-1" />
                    Limit: {user.contractLimitOverride === 0 ? '∞' : user.contractLimitOverride}
                  </Badge>
                )}

                {user.role === 'superadmin' && (
                  <Badge variant="default" className="bg-purple-50 border border-purple-200 text-purple-700 text-[10px] font-bold hover:bg-purple-100 rounded-lg px-2.5 py-0.5">
                    Superadmin (Free)
                  </Badge>
                )}
                
                {user.isFreeAccount && user.role !== 'superadmin' && user.role !== 'railway_official' && user.role !== 'RAILWAY_OFFICIAL' && (
                  <Badge variant="default" className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-bold hover:bg-emerald-100 rounded-lg px-2.5 py-0.5">
                    Free Account Tier
                  </Badge>
                )}
                
                {!user.isFreeAccount && user.role !== 'superadmin' && user.role !== 'railway_official' && user.role !== 'RAILWAY_OFFICIAL' && user.customProcessingFee !== null && (
                  <Badge variant="secondary" className="bg-amber-50 border border-amber-200 text-amber-700 text-[10px] font-bold hover:bg-amber-100 rounded-lg px-2.5 py-0.5">
                    Custom Fee: ₹{user.customProcessingFee}
                  </Badge>
                )}
                
                <Badge 
                  variant="outline"
                  className={`text-[10px] font-bold uppercase rounded-lg px-2.5 py-0.5 ${
                    user.customerAccount?.status === 'active' 
                      ? 'bg-emerald-50 border-emerald-200/60 text-emerald-700' 
                      : 'bg-rose-50 border-rose-200/60 text-rose-700'
                  }`}
                >
                  {user.customerAccount?.status || 'inactive'}
                </Badge>
              </div>
            </div>
          </div>
          
          {/* Credit Balance and Actions */}
          <div className="flex items-center justify-between md:justify-end gap-4 border-t md:border-t-0 border-slate-100 pt-4 md:pt-0 w-full md:w-auto">
            <div className="flex items-center gap-3">
              <div className="p-3.5 rounded-2xl bg-emerald-50/60 border border-emerald-100/80 shadow-sm flex flex-col items-end justify-center min-w-[120px] group-hover:scale-102 transition-transform duration-300">
                <div className="flex items-center gap-0.5 text-xl font-black text-emerald-600 tracking-tight leading-none mb-1">
                  <IndianRupee className="h-4 w-4" />
                  {user.customerAccount?.creditBalance?.toFixed(2) || '0.00'}
                </div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 leading-none">Credit Balance</div>
              </div>
            </div>
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-11 w-11 bg-slate-50 border border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-2xl shadow-sm transition-colors">
                  <MoreVertical className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52 bg-white border border-slate-200/80 text-slate-700 rounded-2xl p-1.5 shadow-xl">
                <DropdownMenuLabel className="text-slate-400 font-bold uppercase tracking-wider text-[10px] px-3.5 py-2">Operations</DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-slate-100" />
                <DropdownMenuItem onClick={() => onOpenRoleDialog(user)} className="focus:bg-slate-50 focus:text-slate-900 rounded-xl px-3.5 py-2 text-xs font-semibold cursor-pointer">
                  <UserCog className="h-4 w-4 mr-3 text-slate-500" />
                  Adjust Security Role
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onOpenCreditDialog(user)} className="focus:bg-slate-50 focus:text-slate-900 rounded-xl px-3.5 py-2 text-xs font-semibold cursor-pointer">
                  <CreditCard className="h-4 w-4 mr-3 text-slate-500" />
                  Manage Credit Reserves
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onOpenProcessingFeeDialog(user)} className="focus:bg-slate-50 focus:text-slate-900 rounded-xl px-3.5 py-2 text-xs font-semibold cursor-pointer">
                  <Activity className="h-4 w-4 mr-3 text-slate-500" />
                  Configure Processing Fee
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onOpenHistoryDialog(user)} className="focus:bg-slate-50 focus:text-slate-900 rounded-xl px-3.5 py-2 text-xs font-semibold cursor-pointer">
                  <History className="h-4 w-4 mr-3 text-slate-500" />
                  Inspect Audit Logs
                </DropdownMenuItem>
                {(user.role === 'railway_official' || user.role === 'RAILWAY_OFFICIAL') && (
                  <DropdownMenuItem onClick={() => onOpenContractLimitDialog(user)} className="focus:bg-slate-50 focus:text-slate-900 rounded-xl px-3.5 py-2 text-xs font-semibold cursor-pointer">
                    <FolderOpen className="h-4 w-4 mr-3 text-cyan-500" />
                    Set Contract Limit
                  </DropdownMenuItem>
                )}
                {canDelete && (
                  <>
                    <DropdownMenuSeparator className="bg-slate-100" />
                    <DropdownMenuItem 
                      onClick={() => onOpenDeleteDialog(user)}
                      className="text-rose-600 focus:bg-rose-50 focus:text-rose-700 rounded-xl px-3.5 py-2 text-xs font-semibold cursor-pointer"
                    >
                      <Trash2 className="h-4 w-4 mr-3 text-rose-500" />
                      Terminate User Account
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

