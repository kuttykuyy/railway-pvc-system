
/**
 * User Filters Component
 */

'use client';

import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Filter } from 'lucide-react';

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
    <div className="flex flex-col sm:flex-row gap-4">
      <div className="flex-1 relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by name or email..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-9"
        />
      </div>

      <Select value={roleFilter} onValueChange={onRoleFilterChange}>
        <SelectTrigger className="w-full sm:w-[180px]">
          <Filter className="h-4 w-4 mr-2" />
          <SelectValue placeholder="Filter by role" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Roles</SelectItem>
          <SelectItem value="contractor">Contractor</SelectItem>
          <SelectItem value="railway_official">Railway Official</SelectItem>
          <SelectItem value="admin">Admin</SelectItem>
        </SelectContent>
      </Select>

      <Select value={accountTypeFilter} onValueChange={onAccountTypeFilterChange}>
        <SelectTrigger className="w-full sm:w-[180px]">
          <Filter className="h-4 w-4 mr-2" />
          <SelectValue placeholder="Filter by account" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Accounts</SelectItem>
          <SelectItem value="free">Free Accounts</SelectItem>
          <SelectItem value="paid">Paid Accounts</SelectItem>
          <SelectItem value="trial">Trial Active</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
