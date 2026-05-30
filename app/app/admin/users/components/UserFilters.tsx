
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
    <div className="p-4 border border-white/5 bg-slate-900/30 backdrop-blur-md rounded-3xl shadow-2xl flex flex-col sm:flex-row gap-4 items-center">
      {/* Search Input */}
      <div className="flex-1 w-full relative group">
        <Search className="absolute left-4.5 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-500 group-focus-within:text-violet-400 transition-colors" />
        <Input
          placeholder="Search directory by name, email, phone..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-11 pr-4 bg-slate-950/40 border-white/5 focus:border-violet-500/50 focus:ring-violet-500/20 text-slate-200 placeholder-slate-500 h-11 rounded-2xl shadow-inner transition-all"
        />
      </div>

      {/* Role Filter */}
      <div className="w-full sm:w-auto flex items-center gap-2">
        <Select value={roleFilter} onValueChange={onRoleFilterChange}>
          <SelectTrigger className="w-full sm:w-[190px] h-11 bg-slate-950/40 border-white/5 focus:border-violet-500/50 focus:ring-violet-500/20 text-slate-300 rounded-2xl shadow-sm transition-all">
            <div className="flex items-center gap-2">
              <Filter className="h-3.5 w-3.5 text-slate-500" />
              <SelectValue placeholder="System Role" />
            </div>
          </SelectTrigger>
          <SelectContent className="bg-slate-900/95 border-white/10 backdrop-blur-xl text-slate-200 rounded-2xl">
            <SelectItem value="all" className="focus:bg-violet-600 focus:text-white rounded-xl">All System Roles</SelectItem>
            <SelectItem value="contractor" className="focus:bg-violet-600 focus:text-white rounded-xl">Contractors</SelectItem>
            <SelectItem value="railway_official" className="focus:bg-violet-600 focus:text-white rounded-xl">Railway Officials</SelectItem>
            <SelectItem value="admin" className="focus:bg-violet-600 focus:text-white rounded-xl">Administrators</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Account Type Filter */}
      <div className="w-full sm:w-auto flex items-center gap-2">
        <Select value={accountTypeFilter} onValueChange={onAccountTypeFilterChange}>
          <SelectTrigger className="w-full sm:w-[190px] h-11 bg-slate-950/40 border-white/5 focus:border-violet-500/50 focus:ring-violet-500/20 text-slate-300 rounded-2xl shadow-sm transition-all">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-3.5 w-3.5 text-slate-500" />
              <SelectValue placeholder="Account Billing" />
            </div>
          </SelectTrigger>
          <SelectContent className="bg-slate-900/95 border-white/10 backdrop-blur-xl text-slate-200 rounded-2xl">
            <SelectItem value="all" className="focus:bg-violet-600 focus:text-white rounded-xl">All Account Types</SelectItem>
            <SelectItem value="free" className="focus:bg-violet-600 focus:text-white rounded-xl">Free Tiers</SelectItem>
            <SelectItem value="paid" className="focus:bg-violet-600 focus:text-white rounded-xl">Paid / Active Balances</SelectItem>
            <SelectItem value="trial" className="focus:bg-violet-600 focus:text-white rounded-xl">Active Sandbox Trials</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

