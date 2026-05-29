
/**
 * Bills page filter controls
 */

'use client';

import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Filter, X, Search } from 'lucide-react';
import type { Contract, BillFilters } from './types';

interface BillsFiltersProps {
  filters: BillFilters;
  contracts: Contract[];
  onFilterChange: (filters: Partial<BillFilters>) => void;
  onReset: () => void;
}

export function BillsFilters({ filters, contracts, onFilterChange, onReset }: BillsFiltersProps) {
  const hasActiveFilters = Object.values(filters).some(value => value !== '');

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search bills..."
              value={filters.search}
              onChange={(e) => onFilterChange({ search: e.target.value })}
              className="pl-10"
            />
          </div>

          {/* Contract Filter */}
          <Select
            value={filters.contractId}
            onValueChange={(value) => onFilterChange({ contractId: value })}
          >
            <SelectTrigger>
              <SelectValue placeholder="All Contracts" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Contracts</SelectItem>
              {contracts.map((contract) => (
                <SelectItem key={contract.id} value={contract.id}>
                  {contract.agreementNo}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Extension Status Filter */}
          <Select
            value={filters.extensionStatus}
            onValueChange={(value) => onFilterChange({ extensionStatus: value })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Extension Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Bills</SelectItem>
              <SelectItem value="regular">Regular Bills</SelectItem>
              <SelectItem value="extension">Extension Bills</SelectItem>
            </SelectContent>
          </Select>

          {/* Approval Status Filter */}
          <Select
            value={filters.approvalStatus}
            onValueChange={(value) => onFilterChange({ approvalStatus: value })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Approval Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="revision_requested">Revision Requested</SelectItem>
            </SelectContent>
          </Select>

          {/* Reset Button */}
          {hasActiveFilters && (
            <Button
              variant="outline"
              onClick={onReset}
              className="w-full md:col-span-2 lg:col-span-1"
            >
              <X className="h-4 w-4 mr-2" />
              Reset Filters
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
