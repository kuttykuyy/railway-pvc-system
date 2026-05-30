
/**
 * User Filters Component
 */

'use client';

import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Filter, ShieldAlert } from 'lucide-react';

interface UserFiltersProps {
  searchQuery: string;
  roleFilter: string;
  accountTypeFilter: string;
  onSearchChange: (value: string) => void;
  onRoleFilterChange: (value: string) => void;
  onAccountTypeFilterChange: (value: string) => void;
}

export function UserFilters({
  searchQuery,
  roleFilter,
  accountTypeFilter,
  onSearchChange,
  onRoleFilterChange,
  onAccountTypeFilterChange
}: UserFiltersProps) {
  return (
    <div className="p-4 border border-slate-200/60 bg-white/70 backdrop-blur-md rounded-3xl shadow-[0_15px_35px_rgba(0,0,0,0.02)] flex flex-col sm:flex-row gap-4 items-center">
      {/* Search Input */}
      <div className="flex-1 w-full relative group">
        <Search className="absolute left-4.5 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-violet-500 transition-colors" />
        <Input
          placeholder="Search directory by name, email, phone..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-11 pr-4 bg-slate-50/50 border border-slate-200/80 focus:border-violet-500/50 focus:ring-violet-500/20 text-slate-800 placeholder-slate-400 h-11 rounded-2xl shadow-inner transition-all focus:bg-white"
        />
      </div>

      {/* Role Filter */}
      <div className="w-full sm:w-auto flex items-center gap-2">
        <Select value={roleFilter} onValueChange={onRoleFilterChange}>
          <SelectTrigger className="w-full sm:w-[190px] h-11 bg-slate-50/50 border border-slate-200/80 focus:border-violet-500/50 focus:ring-violet-500/20 text-slate-700 hover:bg-slate-50 rounded-2xl shadow-sm transition-all">
            <div className="flex items-center gap-2">
              <Filter className="h-3.5 w-3.5 text-slate-400" />
              <SelectValue placeholder="System Role" />
            </div>
          </SelectTrigger>
          <SelectContent className="bg-white border border-slate-200 text-slate-700 rounded-2xl shadow-xl">
            <SelectItem value="all" className="focus:bg-slate-50 focus:text-slate-900 rounded-xl cursor-pointer">All System Roles</SelectItem>
            <SelectItem value="contractor" className="focus:bg-slate-50 focus:text-slate-900 rounded-xl cursor-pointer">Contractors</SelectItem>
            <SelectItem value="railway_official" className="focus:bg-slate-50 focus:text-slate-900 rounded-xl cursor-pointer">Railway Officials</SelectItem>
            <SelectItem value="admin" className="focus:bg-slate-50 focus:text-slate-900 rounded-xl cursor-pointer">Administrators</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Account Type Filter */}
      <div className="w-full sm:w-auto flex items-center gap-2">
        <Select value={accountTypeFilter} onValueChange={onAccountTypeFilterChange}>
          <SelectTrigger className="w-full sm:w-[190px] h-11 bg-slate-50/50 border border-slate-200/80 focus:border-violet-500/50 focus:ring-violet-500/20 text-slate-700 hover:bg-slate-50 rounded-2xl shadow-sm transition-all">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-3.5 w-3.5 text-slate-400" />
              <SelectValue placeholder="Account Billing" />
            </div>
          </SelectTrigger>
          <SelectContent className="bg-white border border-slate-200 text-slate-700 rounded-2xl shadow-xl">
            <SelectItem value="all" className="focus:bg-slate-50 focus:text-slate-900 rounded-xl cursor-pointer">All Account Types</SelectItem>
            <SelectItem value="free" className="focus:bg-slate-50 focus:text-slate-900 rounded-xl cursor-pointer">Free Tiers</SelectItem>
            <SelectItem value="paid" className="focus:bg-slate-50 focus:text-slate-900 rounded-xl cursor-pointer">Paid / Active Balances</SelectItem>
            <SelectItem value="trial" className="focus:bg-slate-50 focus:text-slate-900 rounded-xl cursor-pointer">Active Sandbox Trials</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

