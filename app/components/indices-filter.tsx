
'use client';

import { useState, useMemo } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertTriangle, CheckCircle, Filter, Plus, Search, ArrowUpDown, X, SlidersHorizontal, TrendingUp, TrendingDown, Minus, BarChart2 } from 'lucide-react';
import Link from 'next/link';
import { format } from 'date-fns';

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
  description?: string | null;
  createdAt: Date;
  updatedAt: Date;
  monthlyValues: MonthlyIndexValue[];
}

interface IndicesFilterProps {
  indices: PriceIndex[];
}

export default function IndicesFilter({ indices }: IndicesFilterProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [sortBy, setSortBy] = useState('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [showFilters, setShowFilters] = useState(true);

  const filteredAndSortedIndices = useMemo(() => {
    let result = indices.map(index => ({
      ...index,
      monthlyValues: index.monthlyValues.filter(value => {
        if (filterType === 'all') return true;
        if (filterType === 'final') return !value.isProvisional;
        if (filterType === 'provisional') return value.isProvisional;
        return true;
      })
    }));

    // Apply search filter
    if (searchQuery) {
      result = result.filter(index =>
        index.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        index.description?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Apply data availability filter
    if (filterType === 'no-data') {
      result = result.filter(index => index.monthlyValues.length === 0);
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
        case 'dataCount':
          comparison = a.monthlyValues.length - b.monthlyValues.length;
          break;
        default:
          comparison = 0;
      }

      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [indices, searchQuery, filterType, sortBy, sortOrder]);

  const clearFilters = () => {
    setSearchQuery('');
    setFilterType('all');
  };

  const toggleSortOrder = () => {
    setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
  };

  const hasActiveFilters = searchQuery || filterType !== 'all';

  return (
    <div className="space-y-4">
      {/* Advanced Filter Controls */}
      <Card className="border-0 shadow-lg bg-white">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <SlidersHorizontal className="h-5 w-5 text-emerald-600" />
                Filter & Sort
              </CardTitle>
              <CardDescription className="mt-1">
                Refine your search with advanced filters
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {hasActiveFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearFilters}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                >
                  <X className="h-4 w-4 mr-1" />
                  Clear
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowFilters(!showFilters)}
                className="shadow-sm"
              >
                <Filter className="h-4 w-4 mr-2" />
                {showFilters ? 'Hide' : 'Show'}
              </Button>
            </div>
          </div>
        </CardHeader>
        {showFilters && (
          <CardContent className="pt-0">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Search */}
              <div className="space-y-2">
                <Label htmlFor="search" className="text-sm font-medium text-gray-700">
                  Search Indices
                </Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    id="search"
                    type="text"
                    placeholder="Search by name..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 border-gray-300 focus:border-emerald-500 focus:ring-emerald-500"
                  />
                </div>
              </div>

              {/* Status Filter */}
              <div className="space-y-2">
                <Label htmlFor="status-filter" className="text-sm font-medium text-gray-700">
                  Data Status
                </Label>
                <Select value={filterType} onValueChange={setFilterType}>
                  <SelectTrigger id="status-filter" className="border-gray-300 focus:border-emerald-500 focus:ring-emerald-500">
                    <SelectValue placeholder="All Indices" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Indices</SelectItem>
                    <SelectItem value="final">Final Only</SelectItem>
                    <SelectItem value="provisional">Provisional Only</SelectItem>
                    <SelectItem value="no-data">No Data</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Sort By */}
              <div className="space-y-2">
                <Label htmlFor="sort-by" className="text-sm font-medium text-gray-700">
                  Sort By
                </Label>
                <div className="flex gap-2">
                  <Select value={sortBy} onValueChange={setSortBy}>
                    <SelectTrigger id="sort-by" className="border-gray-300 focus:border-emerald-500 focus:ring-emerald-500">
                      <SelectValue placeholder="Sort by..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="name">Name</SelectItem>
                      <SelectItem value="baseValue">Base Value</SelectItem>
                      <SelectItem value="latestValue">Latest Value</SelectItem>
                      <SelectItem value="dataCount">Data Points</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={toggleSortOrder}
                    title={`Sort ${sortOrder === 'asc' ? 'Descending' : 'Ascending'}`}
                    className="shadow-sm hover:shadow-md transition-shadow"
                  >
                    <ArrowUpDown className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Active Filters Summary */}
            {hasActiveFilters && (
              <div className="mt-4 pt-4 border-t border-gray-200">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-gray-700">Active Filters:</span>
                  {searchQuery && (
                    <Badge variant="secondary" className="bg-emerald-100 text-emerald-900">
                      Search: {searchQuery}
                    </Badge>
                  )}
                  {filterType !== 'all' && (
                    <Badge variant="secondary" className="bg-emerald-100 text-emerald-900">
                      Status: {filterType}
                    </Badge>
                  )}
                  <Badge variant="outline" className="border-gray-400">
                    Showing {filteredAndSortedIndices.length} of {indices.length} indices
                  </Badge>
                </div>
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* Indices Grid */}
      {filteredAndSortedIndices.length === 0 ? (
        <Card className="border-0 shadow-lg">
          <CardContent className="py-16">
            <div className="flex flex-col items-center gap-4 text-gray-500">
              <div className="p-4 bg-gray-100 rounded-full">
                <Filter className="h-12 w-12 text-gray-400" />
              </div>
              <p className="text-xl font-semibold text-gray-700">No indices found</p>
              <p className="text-sm text-gray-600 text-center max-w-md">
                Try adjusting your search or filter criteria to find what you're looking for
              </p>
              {hasActiveFilters && (
                <Button
                  variant="outline"
                  onClick={clearFilters}
                  className="mt-2 shadow-sm hover:shadow-md transition-shadow"
                >
                  <X className="h-4 w-4 mr-2" />
                  Clear All Filters
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredAndSortedIndices.map((index) => {
            const hasData = index.monthlyValues.length > 0;
            const latestValue = hasData ? index.monthlyValues[0] : null;
            const previousValue = hasData && index.monthlyValues.length > 1 ? index.monthlyValues[1] : null;
            const provisional = index.monthlyValues.filter(v => v.isProvisional).length;
            const final = index.monthlyValues.length - provisional;
            
            // Calculate trend
            let trend = 0;
            let trendPercent = 0;
            if (latestValue && previousValue) {
              trend = latestValue.value - previousValue.value;
              trendPercent = (trend / previousValue.value) * 100;
            }

            // Calculate change from base
            let changeFromBase = 0;
            let changeFromBasePercent = 0;
            if (latestValue) {
              changeFromBase = latestValue.value - index.baseValue;
              changeFromBasePercent = (changeFromBase / index.baseValue) * 100;
            }
            
            return (
              <Card key={index.id} className="border-0 shadow-lg hover:shadow-xl transition-all duration-300 group overflow-hidden">
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-green-500 via-emerald-500 to-emerald-500"></div>
                
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base font-bold text-gray-900 group-hover:text-emerald-600 transition-colors">
                      {index.name}
                    </CardTitle>
                    {latestValue?.isProvisional && (
                      <Badge variant="secondary" className="text-xs bg-orange-100 text-orange-900 border-orange-200">
                        <AlertTriangle className="h-3 w-3 mr-1" />
                        Provisional
                      </Badge>
                    )}
                    {latestValue && !latestValue.isProvisional && (
                      <Badge variant="default" className="text-xs bg-green-100 text-green-900 border-green-200">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Final
                      </Badge>
                    )}
                  </div>
                  <CardDescription className="text-xs mt-1">
                    {index.description || "Railway PVC price index"}
                  </CardDescription>
                </CardHeader>
                
                <CardContent className="space-y-3">
                  {hasData ? (
                    <>
                      {/* Latest Value with Trend */}
                      <div className="bg-gradient-to-br from-emerald-50 to-emerald-50 p-4 rounded-xl border border-emerald-100">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-xs font-medium text-gray-600">Latest Value</p>
                          <p className="text-xs text-gray-600">
                            {latestValue && format(new Date(latestValue.month), 'MMM yyyy')}
                          </p>
                        </div>
                        <div className="flex items-end justify-between">
                          <p className="text-3xl font-bold text-emerald-900">
                            {latestValue?.value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                          </p>
                          {previousValue && (
                            <div className={`flex items-center gap-1 px-2 py-1 rounded-lg ${
                              trend > 0 ? 'bg-green-100 text-green-700' : 
                              trend < 0 ? 'bg-red-100 text-red-700' : 
                              'bg-gray-100 text-gray-700'
                            }`}>
                              {trend > 0 && <TrendingUp className="h-3.5 w-3.5" />}
                              {trend < 0 && <TrendingDown className="h-3.5 w-3.5" />}
                              {trend === 0 && <Minus className="h-3.5 w-3.5" />}
                              <span className="text-xs font-semibold">
                                {trendPercent > 0 ? '+' : ''}{trendPercent.toFixed(2)}%
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Base Value and Change */}
                      <div className="grid grid-cols-2 gap-2">
                        <div className="bg-gray-50 p-2.5 rounded-lg border border-gray-200">
                          <p className="text-xs text-gray-600 mb-1">Base Value</p>
                          <p className="text-sm font-bold text-gray-900">
                            {index.baseValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                          </p>
                        </div>
                        <div className={`p-2.5 rounded-lg border ${
                          changeFromBase > 0 ? 'bg-green-50 border-green-200' : 
                          changeFromBase < 0 ? 'bg-red-50 border-red-200' : 
                          'bg-gray-50 border-gray-200'
                        }`}>
                          <p className="text-xs text-gray-600 mb-1">Change from Base</p>
                          <p className={`text-sm font-bold ${
                            changeFromBase > 0 ? 'text-green-700' : 
                            changeFromBase < 0 ? 'text-red-700' : 
                            'text-gray-700'
                          }`}>
                            {changeFromBase > 0 ? '+' : ''}{changeFromBasePercent.toFixed(2)}%
                          </p>
                        </div>
                      </div>

                      {/* Stats */}
                      <div className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg">
                        <div className="flex items-center gap-3 text-xs">
                          <div className="flex items-center gap-1">
                            <CheckCircle className="h-3.5 w-3.5 text-green-600" />
                            <span className="font-semibold text-green-700">{final}</span>
                            <span className="text-gray-600">Final</span>
                          </div>
                          {provisional > 0 && (
                            <div className="flex items-center gap-1">
                              <AlertTriangle className="h-3.5 w-3.5 text-orange-600" />
                              <span className="font-semibold text-orange-700">{provisional}</span>
                              <span className="text-gray-600">Provisional</span>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-1 text-xs text-gray-500">
                          <BarChart2 className="h-3.5 w-3.5" />
                          <span className="font-medium">{index.monthlyValues.length}</span>
                        </div>
                      </div>

                      {/* Recent Values Timeline */}
                      <div className="space-y-1.5">
                        <p className="text-xs font-medium text-gray-700">Recent Values</p>
                        <div className="grid grid-cols-6 gap-1.5">
                          {index.monthlyValues.slice(0, 6).map((value) => (
                            <div 
                              key={value.id} 
                              className={`text-center p-2 rounded-md relative group/cell ${
                                value.isProvisional ? 'bg-orange-50 border border-orange-200' : 'bg-green-50 border border-green-200'
                              }`}
                              title={`${format(new Date(value.month), 'MMM yyyy')}: ${value.value.toLocaleString('en-IN')}`}
                            >
                              <p className="text-xs font-bold text-gray-900 truncate">
                                {value.value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                              </p>
                              <p className="text-[9px] text-gray-600 uppercase">
                                {format(new Date(value.month), 'MMM')}
                              </p>
                              {value.isProvisional && (
                                <div className="absolute -top-1 -right-1">
                                  <AlertTriangle className="h-2.5 w-2.5 text-orange-500" />
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="text-center py-8 bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl border-2 border-dashed border-gray-300">
                      <div className="flex flex-col items-center gap-3">
                        <div className="p-3 bg-white rounded-full shadow-sm">
                          <BarChart2 className="h-6 w-6 text-gray-400" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900 mb-1">No data available</p>
                          <p className="text-xs text-gray-600">Start tracking this index</p>
                        </div>
                        <Button asChild size="sm" variant="outline" className="mt-2 shadow-sm hover:shadow-md transition-shadow">
                          <Link href="/indices/monthly">
                            <Plus className="h-3.5 w-3.5 mr-1.5" />
                            Add Values
                          </Link>
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
