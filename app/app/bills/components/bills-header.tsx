
/**
 * Bills page header with actions
 */

'use client';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, Grid3X3, List, Download } from 'lucide-react';
import Link from 'next/link';
import type { ViewMode } from './types';

interface BillsHeaderProps {
  totalBills: number;
  selectedCount: number;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onBulkExport?: () => void;
  canCreateBills?: boolean;
}

export function BillsHeader({
  totalBills,
  selectedCount,
  viewMode,
  onViewModeChange,
  onBulkExport,
  canCreateBills = true,
}: BillsHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Bills</h1>
        <p className="text-muted-foreground mt-1">
          {totalBills} {totalBills === 1 ? 'bill' : 'bills'} found
          {selectedCount > 0 && (
            <Badge variant="secondary" className="ml-2">
              {selectedCount} selected
            </Badge>
          )}
        </p>
      </div>

      <div className="flex items-center gap-2">
        {/* View Mode Toggle */}
        <div className="flex border rounded-lg">
          <Button
            variant={viewMode === 'table' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => onViewModeChange('table')}
            className="rounded-r-none"
          >
            <List className="h-4 w-4" />
          </Button>
          <Button
            variant={viewMode === 'grid' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => onViewModeChange('grid')}
            className="rounded-l-none"
          >
            <Grid3X3 className="h-4 w-4" />
          </Button>
        </div>

        {/* Bulk Actions */}
        {selectedCount > 0 && onBulkExport && (
          <Button variant="outline" size="sm" onClick={onBulkExport}>
            <Download className="h-4 w-4 mr-2" />
            Export Selected
          </Button>
        )}

        {/* Create New Bill */}
        {canCreateBills && (
          <Link href="/bills/new">
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              New Bill
            </Button>
          </Link>
        )}
      </div>
    </div>
  );
}
