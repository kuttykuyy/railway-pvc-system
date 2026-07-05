

'use client';

import { useState, useEffect, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getClientRoleInfo } from '@/lib/role-auth-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { StatusMessage } from '@/components/ui/status-message';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { TrendingUp, Save, Calendar, AlertTriangle, CheckCircle, TableProperties, Search, Filter, ArrowUpDown, SlidersHorizontal, X } from 'lucide-react';
import Link from 'next/link';
import { BackButton } from '@/components/ui/back-button';
import { format, addMonths, startOfMonth } from 'date-fns';
import { Label } from '@/components/ui/label';

interface MonthlyIndexValue {
  id: string;
  priceIndexId: string;
  month: Date;
  value: number;
  isProvisional: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface PriceIndex {
  id: string;
  name: string;
  baseValue: number;
  description?: string;
  monthlyValues: MonthlyIndexValue[];
}

interface TableCell {
  priceIndexId: string;
  month: string;
  value: number | null;
  isProvisional: boolean;
  exists: boolean;
}

export default function IndicesTablePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [indices, setIndices] = useState<PriceIndex[]>([]);
  const [months, setMonths] = useState<string[]>([]);
  const [tableData, setTableData] = useState<Record<string, TableCell>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  // Filter and Sort states
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [showFilters, setShowFilters] = useState(false);
  const [monthRangeStart, setMonthRangeStart] = useState('');
  const [monthRangeEnd, setMonthRangeEnd] = useState('');
  const [showOnlyCompleteMonths, setShowOnlyCompleteMonths] = useState(false);

  // Check if user is admin
  const { isAdmin } = getClientRoleInfo(session);

  // Redirect unauthenticated users only
  useEffect(() => {
    if (status === 'loading') return;
    
    if (!session) {
      router.push('/auth/signin');
      return;
    }
  }, [session, status, router]);

  useEffect(() => {
    fetchIndices();
  }, []);

  useEffect(() => {
    if (indices.length > 0) {
      generateTableData();
    }
  }, [indices, monthRangeStart, monthRangeEnd, showOnlyCompleteMonths]);

  // Filtered and sorted indices
  const filteredAndSortedIndices = useMemo(() => {
    let result = [...indices];

    // Apply search filter
    if (searchQuery) {
      result = result.filter(index =>
        index.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        index.description?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Apply status filter
    if (statusFilter !== 'all') {
      result = result.filter(index => {
        const latestValue = index.monthlyValues[0];
        if (!latestValue) return statusFilter === 'no-data';
        if (statusFilter === 'final') return !latestValue.isProvisional;
        if (statusFilter === 'provisional') return latestValue.isProvisional;
        return true;
      });
    }

    // Apply sorting
    result.sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'baseValue':
          comparison = a.baseValue - b.baseValue;
          break;
        case 'latestValue':
          const aLatest = a.monthlyValues[0]?.value || 0;
          const bLatest = b.monthlyValues[0]?.value || 0;
          comparison = aLatest - bLatest;
          break;
        case 'status':
          const aStatus = a.monthlyValues[0]?.isProvisional ? 1 : 0;
          const bStatus = b.monthlyValues[0]?.isProvisional ? 1 : 0;
          comparison = aStatus - bStatus;
          break;
        default:
          comparison = 0;
      }

      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [indices, searchQuery, statusFilter, sortBy, sortOrder]);

  const fetchIndices = async () => {
    try {
      const response = await fetch('/api/indices');
      if (!response.ok) throw new Error('Failed to fetch indices');
      
      const data = await response.json();
      setIndices(data);
    } catch (error: any) {
      console.error('Error fetching indices:', error);
      setError(error.message || 'Failed to fetch price indices');
    } finally {
      setIsLoading(false);
    }
  };

  const generateTableData = () => {
    // Generate month range
    let monthsList: string[] = [];
    
    if (monthRangeStart && monthRangeEnd) {
      // Use custom range
      const start = new Date(monthRangeStart);
      const end = new Date(monthRangeEnd);
      let current = startOfMonth(start);
      const endMonth = startOfMonth(end);
      
      while (current <= endMonth) {
        monthsList.push(format(current, 'yyyy-MM-dd'));
        current = addMonths(current, 1);
      }
    } else {
      // Default: last 12 months
      const currentDate = new Date();
      for (let i = 11; i >= 0; i--) {
        const monthDate = addMonths(startOfMonth(currentDate), -i);
        monthsList.push(format(monthDate, 'yyyy-MM-dd'));
      }
    }
    
    // Filter months to only show those with all 10 indices
    if (showOnlyCompleteMonths && indices.length === 10) {
      monthsList = monthsList.filter(month => {
        // Count how many indices have values for this month
        const indicesWithValues = indices.filter(index => {
          return index.monthlyValues.some(mv => {
            const mvMonth = format(new Date(mv.month), 'yyyy-MM-dd');
            return mvMonth === month;
          });
        });
        
        // Only include month if all 10 indices have values
        return indicesWithValues.length === 10;
      });
    }
    
    setMonths(monthsList);

    // Create table data structure
    const data: Record<string, TableCell> = {};
    
    indices.forEach(index => {
      monthsList.forEach(month => {
        const key = `${index.id}-${month}`;
        const existingValue = index.monthlyValues.find(mv => {
          const mvMonth = format(new Date(mv.month), 'yyyy-MM-dd');
          return mvMonth === month;
        });
        
        data[key] = {
          priceIndexId: index.id,
          month,
          value: existingValue?.value || null,
          isProvisional: existingValue?.isProvisional || false,
          exists: !!existingValue
        };
      });
    });
    
    setTableData(data);
  };

  const handleValueChange = (priceIndexId: string, month: string, value: string) => {
    const key = `${priceIndexId}-${month}`;
    setTableData(prev => ({
      ...prev,
      [key]: {
        ...prev[key],
        value: value ? parseFloat(value) : null
      }
    }));
  };

  const handleStatusChange = (priceIndexId: string, month: string, isProvisional: boolean) => {
    const key = `${priceIndexId}-${month}`;
    setTableData(prev => ({
      ...prev,
      [key]: {
        ...prev[key],
        isProvisional
      }
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const valuesToUpdate = Object.values(tableData)
        .filter(cell => cell.value !== null && cell.value > 0)
        .map(cell => ({
          priceIndexId: cell.priceIndexId,
          month: cell.month,
          value: cell.value!,
          isProvisional: cell.isProvisional
        }));

      if (valuesToUpdate.length === 0) {
        setError('Please enter at least one index value');
        return;
      }

      const response = await fetch('/api/indices/monthly', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ values: valuesToUpdate })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update values');
      }

      setSuccess(`Successfully updated ${valuesToUpdate.length} index values`);
      
      // Refresh data
      fetchIndices();
    } catch (error: any) {
      console.error('Error saving values:', error);
      setError(error.message || 'Failed to save index values');
    } finally {
      setSaving(false);
    }
  };

  const clearFilters = () => {
    setSearchQuery('');
    setStatusFilter('all');
    setMonthRangeStart('');
    setMonthRangeEnd('');
    setShowOnlyCompleteMonths(false);
  };

  const toggleSortOrder = () => {
    setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
  };

  const hasActiveFilters = searchQuery || statusFilter !== 'all' || monthRangeStart || monthRangeEnd || showOnlyCompleteMonths;

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-64">
        <LoadingSpinner size="lg" text="Loading price indices..." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <BackButton href="/indices" label="Back to Indices" variant="outline" />
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <TableProperties className="h-8 w-8 text-green-600" />
            Price Indices Table
          </h1>
          <p className="text-gray-600 mt-2">
            Manage all indices values and set their status as Final or Provisional
          </p>
        </div>
      </div>

      {error && (
        <StatusMessage type="error" title="Error" message={error} />
      )}
      
      {success && (
        <StatusMessage type="success" title="Success" message={success} />
      )}

      {/* Filter and Sort Controls */}
      <Card className="border-0 shadow-lg">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <SlidersHorizontal className="h-5 w-5" />
              Filter & Sort
            </CardTitle>
            <div className="flex items-center gap-2">
              {hasActiveFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearFilters}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                >
                  <X className="h-4 w-4 mr-1" />
                  Clear Filters
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowFilters(!showFilters)}
              >
                <Filter className="h-4 w-4 mr-2" />
                {showFilters ? 'Hide Filters' : 'Show Filters'}
              </Button>
            </div>
          </div>
        </CardHeader>
        {showFilters && (
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Search */}
              <div className="space-y-2">
                <Label htmlFor="search" className="text-sm font-medium">
                  Search
                </Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    id="search"
                    type="text"
                    placeholder="Search indices..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>

              {/* Status Filter */}
              <div className="space-y-2">
                <Label htmlFor="status-filter" className="text-sm font-medium">
                  Status
                </Label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger id="status-filter">
                    <SelectValue placeholder="All Statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="final">Final Only</SelectItem>
                    <SelectItem value="provisional">Provisional Only</SelectItem>
                    <SelectItem value="no-data">No Data</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Sort By */}
              <div className="space-y-2">
                <Label htmlFor="sort-by" className="text-sm font-medium">
                  Sort By
                </Label>
                <div className="flex gap-2">
                  <Select value={sortBy} onValueChange={setSortBy}>
                    <SelectTrigger id="sort-by">
                      <SelectValue placeholder="Sort by..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="name">Name</SelectItem>
                      <SelectItem value="baseValue">Base Value</SelectItem>
                      <SelectItem value="latestValue">Latest Value</SelectItem>
                      <SelectItem value="status">Status</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={toggleSortOrder}
                    title={`Sort ${sortOrder === 'asc' ? 'Descending' : 'Ascending'}`}
                  >
                    <ArrowUpDown className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Month Range */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">
                  Month Range (Optional)
                </Label>
                <div className="flex gap-2">
                  <Input
                    type="month"
                    value={monthRangeStart ? format(new Date(monthRangeStart), 'yyyy-MM') : ''}
                    onChange={(e) => setMonthRangeStart(e.target.value ? e.target.value + '-01' : '')}
                    placeholder="Start"
                    className="text-xs"
                  />
                  <Input
                    type="month"
                    value={monthRangeEnd ? format(new Date(monthRangeEnd), 'yyyy-MM') : ''}
                    onChange={(e) => setMonthRangeEnd(e.target.value ? e.target.value + '-01' : '')}
                    placeholder="End"
                    className="text-xs"
                  />
                </div>
              </div>
            </div>
            
            {/* Show Only Complete Months Filter */}
            <div className="mt-4 pt-4 border-t">
              <div className="flex items-center space-x-3">
                <Checkbox
                  id="show-complete-months"
                  checked={showOnlyCompleteMonths}
                  onCheckedChange={(checked) => setShowOnlyCompleteMonths(checked as boolean)}
                />
                <div className="grid gap-1.5 leading-none">
                  <label
                    htmlFor="show-complete-months"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                  >
                    Show only months with all 10 indices
                  </label>
                  <p className="text-xs text-gray-500">
                    Filter to display only months where all price indices have been entered
                  </p>
                </div>
              </div>
            </div>

            {/* Active Filters Summary */}
            {hasActiveFilters && (
              <div className="mt-4 pt-4 border-t">
                <div className="flex flex-wrap gap-2">
                  <span className="text-sm font-medium text-gray-700">Active Filters:</span>
                  {searchQuery && (
                    <Badge variant="secondary">
                      Search: {searchQuery}
                    </Badge>
                  )}
                  {statusFilter !== 'all' && (
                    <Badge variant="secondary">
                      Status: {statusFilter}
                    </Badge>
                  )}
                  {monthRangeStart && monthRangeEnd && (
                    <Badge variant="secondary">
                      Months: {format(new Date(monthRangeStart), 'MMM yyyy')} - {format(new Date(monthRangeEnd), 'MMM yyyy')}
                    </Badge>
                  )}
                  {showOnlyCompleteMonths && (
                    <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                      Complete Months Only
                    </Badge>
                  )}
                  <Badge variant="outline">
                    Showing {filteredAndSortedIndices.length} of {indices.length} indices
                  </Badge>
                  {showOnlyCompleteMonths && (
                    <Badge variant="outline" className="border-blue-300">
                      {months.length} complete month(s)
                    </Badge>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        )}
      </Card>

      <Card className="border-0 shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Price Indices by Month
            </span>
            <Button 
              onClick={handleSave} 
              disabled={isSaving}
              className="bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700"
            >
              {isSaving ? (
                <LoadingSpinner size="sm" text="Saving..." />
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Save Changes
                </>
              )}
            </Button>
          </CardTitle>
          <CardDescription>
            Enter values and select Final/Provisional status for each index by month
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 bg-white border-r-2 font-semibold text-gray-900 min-w-[200px]">
                    Price Index
                  </TableHead>
                  {months.map(month => (
                    <TableHead key={month} className="text-center min-w-[140px]">
                      {format(new Date(month), 'MMM yyyy')}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAndSortedIndices.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={months.length + 1} className="text-center py-8">
                      <div className="flex flex-col items-center gap-2 text-gray-500">
                        <Filter className="h-8 w-8" />
                        <p className="font-medium">No indices match your filters</p>
                        <p className="text-sm">Try adjusting your search or filter criteria</p>
                        {hasActiveFilters && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={clearFilters}
                            className="mt-2"
                          >
                            Clear Filters
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredAndSortedIndices.map(index => (
                    <TableRow key={index.id} className="hover:bg-gray-50">
                      <TableCell className="sticky left-0 bg-white border-r-2 font-medium text-gray-900">
                        <div>
                          <div className="font-semibold">{index.name}</div>
                          <div className="text-xs text-gray-500">
                            Base: {index.baseValue.toLocaleString('en-IN')}
                          </div>
                        </div>
                      </TableCell>
                      {months.map(month => {
                        const key = `${index.id}-${month}`;
                        const cell = tableData[key];
                        
                        return (
                          <TableCell key={month} className="p-2">
                            <div className="space-y-2">
                              <Input
                                type="number"
                                step="0.01"
                                value={cell?.value?.toString() || ''}
                                onChange={(e) => handleValueChange(index.id, month, e.target.value)}
                                placeholder="0.00"
                                className="h-8 text-xs text-center"
                              />
                              <Select 
                                value={cell?.isProvisional ? "provisional" : "final"} 
                                onValueChange={(value) => handleStatusChange(index.id, month, value === "provisional")}
                              >
                                <SelectTrigger className="h-6 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="final">
                                    <div className="flex items-center gap-1">
                                      <CheckCircle className="h-3 w-3 text-green-600" />
                                      <span>Final</span>
                                    </div>
                                  </SelectItem>
                                  <SelectItem value="provisional">
                                    <div className="flex items-center gap-1">
                                      <AlertTriangle className="h-3 w-3 text-orange-600" />
                                      <span>Provisional</span>
                                    </div>
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                              {cell?.exists && (
                                <Badge 
                                  variant={cell.isProvisional ? "secondary" : "default"} 
                                  className="h-4 text-xs px-1"
                                >
                                  {cell.isProvisional ? 'P' : 'F'}
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-lg bg-gradient-to-r from-indigo-50 to-purple-50">
        <CardHeader>
          <CardTitle className="text-xl text-indigo-900">Legend</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center gap-3">
              <Badge variant="default" className="text-xs">
                <CheckCircle className="h-3 w-3 mr-1" />
                Final (F)
              </Badge>
              <span className="text-sm text-gray-700">Official, verified indices</span>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant="secondary" className="text-xs">
                <AlertTriangle className="h-3 w-3 mr-1" />
                Provisional (P)
              </Badge>
              <span className="text-sm text-gray-700">Temporary, subject to revision</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

