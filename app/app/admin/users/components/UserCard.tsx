
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

  // Get dynamic avatar ring colors based on user role
  const getAvatarRingClass = (role: string) => {
    switch (role?.toLowerCase()) {
      case 'superadmin':
        return 'ring-2 ring-purple-500/50 shadow-[0_0_15px_rgba(168,85,247,0.3)]';
      case 'admin':
        return 'ring-2 ring-indigo-500/40 shadow-[0_0_10px_rgba(99,102,241,0.2)]';
      case 'railway_official':
        return 'ring-2 ring-cyan-500/40 shadow-[0_0_10px_rgba(6,182,212,0.2)]';
      default: // contractor
        return 'ring-2 ring-teal-500/30';
    }
  };

  const getAvatarFallbackClass = (role: string) => {
    switch (role?.toLowerCase()) {
      case 'superadmin':
        return 'bg-purple-500/10 text-purple-400 border border-purple-500/20';
      case 'admin':
        return 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20';
      case 'railway_official':
        return 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20';
      default: // contractor
        return 'bg-teal-500/10 text-teal-400 border border-teal-500/20';
    }
  };

  return (
    <Card className="group relative overflow-hidden border border-white/5 bg-slate-900/40 backdrop-blur-md shadow-2xl rounded-3xl transition-all duration-300 transform hover:-translate-y-1 hover:border-white/10 hover:shadow-[0_8px_32px_rgba(99,102,241,0.05)]">
      {/* Background glow hover animation */}
      <div className="absolute inset-0 bg-gradient-to-r from-violet-600/0 via-indigo-600/0 to-cyan-600/0 group-hover:from-violet-600/3 group-hover:via-indigo-600/3 group-hover:to-cyan-600/3 transition-all duration-500 pointer-events-none" />
      
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
                <h3 className="text-lg font-bold text-slate-100 truncate group-hover:text-white transition-colors">
                  {user.name || 'Unknown User'}
                </h3>
                <Badge variant="outline" className="text-xs bg-slate-950/40 border-white/5 font-semibold text-slate-300 py-0.5 rounded-lg shadow-inner">
                  {formatRoleLabel(user.role)}
                </Badge>
                {user.emailVerified && (
                  <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[10px] font-semibold rounded-lg">
                    <ShieldCheck className="h-3 w-3 mr-1" />
                    Verified
                  </Badge>
                )}
              </div>
              
              <div className="space-y-1">
                <p className="text-sm text-slate-400 font-medium truncate leading-none">
                  {user.email}
                </p>
                
                {user.phone && (
                  <p className="text-xs text-slate-500 font-medium flex items-center gap-1.5">
                    <Phone className="h-3 w-3 text-slate-600" />
                    {user.phone}
                  </p>
                )}
              </div>
              
              <div className="flex flex-wrap items-center gap-2 pt-1.5">
                <Badge variant="outline" className="text-[10px] font-medium border-white/5 bg-slate-950/20 text-slate-400 rounded-lg">
                  <FileText className="h-3 w-3 mr-1 text-slate-500" />
                  {user.totalBillsProcessed} bills
                </Badge>

                <Badge variant="outline" className="text-[10px] font-medium border-white/5 bg-slate-950/20 text-slate-400 rounded-lg">
                  <Calendar className="h-3 w-3 mr-1 text-slate-500" />
                  {format(toISTDate(new Date(user.createdAt)), 'dd MMM yyyy')}
                </Badge>
                
                {(user.role === 'railway_official' || user.role === 'RAILWAY_OFFICIAL') && (
                  <Badge variant="default" className="bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-[10px] font-bold hover:bg-cyan-500/20 rounded-lg px-2.5 py-0.5">
                    Railway Official (Free)
                  </Badge>
                )}

                {user.role === 'superadmin' && (
                  <Badge variant="default" className="bg-purple-500/10 border border-purple-500/20 text-purple-400 text-[10px] font-bold hover:bg-purple-500/20 rounded-lg px-2.5 py-0.5">
                    Superadmin (Free)
                  </Badge>
                )}
                
                {user.isFreeAccount && user.role !== 'superadmin' && user.role !== 'railway_official' && user.role !== 'RAILWAY_OFFICIAL' && (
                  <Badge variant="default" className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-bold hover:bg-emerald-500/20 rounded-lg px-2.5 py-0.5">
                    Free Account Tier
                  </Badge>
                )}
                
                {!user.isFreeAccount && user.role !== 'superadmin' && user.role !== 'railway_official' && user.role !== 'RAILWAY_OFFICIAL' && user.customProcessingFee !== null && (
                  <Badge variant="secondary" className="bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[10px] font-bold hover:bg-amber-500/20 rounded-lg px-2.5 py-0.5">
                    Custom Fee: ₹{user.customProcessingFee}
                  </Badge>
                )}
                
                <Badge 
                  variant="outline"
                  className={`text-[10px] font-bold uppercase rounded-lg px-2.5 py-0.5 ${
                    user.customerAccount?.status === 'active' 
                      ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' 
                      : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                  }`}
                >
                  {user.customerAccount?.status || 'inactive'}
                </Badge>
              </div>
            </div>
          </div>
          
          {/* Credit Balance and Actions */}
          <div className="flex items-center justify-between md:justify-end gap-4 border-t md:border-t-0 border-white/5 pt-4 md:pt-0 w-full md:w-auto">
            <div className="flex items-center gap-3">
              <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 shadow-inner flex flex-col items-end justify-center min-w-[120px] group-hover:scale-102 transition-transform duration-300">
                <div className="flex items-center gap-0.5 text-xl font-black text-emerald-400 tracking-tight leading-none mb-1">
                  <IndianRupee className="h-4 w-4" />
                  {user.customerAccount?.creditBalance?.toFixed(2) || '0.00'}
                </div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 leading-none">Credit Balance</div>
              </div>
            </div>
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-11 w-11 bg-slate-950/40 border border-white/5 text-slate-400 hover:text-slate-200 hover:bg-slate-900 rounded-2xl shadow-sm transition-colors">
                  <MoreVertical className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52 bg-slate-900/95 border border-white/10 backdrop-blur-xl text-slate-200 rounded-2xl p-1.5 shadow-2xl">
                <DropdownMenuLabel className="text-slate-400 font-bold uppercase tracking-wider text-[10px] px-3.5 py-2">Operations</DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-white/5" />
                <DropdownMenuItem onClick={() => onOpenRoleDialog(user)} className="focus:bg-violet-600 focus:text-white rounded-xl px-3.5 py-2 text-xs font-semibold cursor-pointer">
                  <UserCog className="h-4 w-4 mr-3 text-slate-400 group-hover:text-white" />
                  Adjust Security Role
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onOpenCreditDialog(user)} className="focus:bg-violet-600 focus:text-white rounded-xl px-3.5 py-2 text-xs font-semibold cursor-pointer">
                  <CreditCard className="h-4 w-4 mr-3 text-slate-400 group-hover:text-white" />
                  Manage Credit Reserves
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onOpenProcessingFeeDialog(user)} className="focus:bg-violet-600 focus:text-white rounded-xl px-3.5 py-2 text-xs font-semibold cursor-pointer">
                  <Activity className="h-4 w-4 mr-3 text-slate-400 group-hover:text-white" />
                  Configure Processing Fee
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onOpenHistoryDialog(user)} className="focus:bg-violet-600 focus:text-white rounded-xl px-3.5 py-2 text-xs font-semibold cursor-pointer">
                  <History className="h-4 w-4 mr-3 text-slate-400 group-hover:text-white" />
                  Inspect Audit Logs
                </DropdownMenuItem>
                {canDelete && (
                  <>
                    <DropdownMenuSeparator className="bg-white/5" />
                    <DropdownMenuItem 
                      onClick={() => onOpenDeleteDialog(user)}
                      className="text-rose-400 focus:bg-rose-600 focus:text-white rounded-xl px-3.5 py-2 text-xs font-semibold cursor-pointer"
                    >
                      <Trash2 className="h-4 w-4 mr-3 text-rose-400 group-hover:text-white" />
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

