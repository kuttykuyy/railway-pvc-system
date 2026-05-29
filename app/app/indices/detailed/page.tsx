
'use client';

import { useState, useEffect, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getClientRoleInfo } from '@/lib/role-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { StatusMessage } from '@/components/ui/status-message';
import { Badge } from '@/components/ui/badge';
import { BackButton } from '@/components/ui/back-button';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Search,
  Filter,
  ArrowUpDown,
  SlidersHorizontal,
  X,
  TrendingUp,
  TrendingDown,
  Calendar,
  CheckCircle,
  AlertTriangle,
  Database,
  Download,
  RefreshCcw,
  Eye,
  BarChart3,
  LineChart,
  PieChart,
  Activity,
  Percent,
  Hash,
  FileText,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { format, subMonths, differenceInMonths } from 'date-fns';
import { toISTDate } from '@/lib/ist-utils';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';

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

interface FilterOptions {
  searchQuery: string;
  statusFilter: 'all' | 'final' | 'provisional' | 'no-data';
  sortBy: 'name' | 'baseValue' | 'latestValue' | 'status' | 'change' | 'dataPoints';
  sortOrder: 'asc' | 'desc';
  valueRangeMin: string;
  valueRangeMax: string;
  baseValueMin: string;
  baseValueMax: string;
  monthRangeStart: string;
  monthRangeEnd: string;
  changePercentMin: string;
  changePercentMax: string;
  dataPointsMin: string;
  hasDescription: 'all' | 'yes' | 'no';
}

export default function DetailedIndicesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [indices, setIndices] = useState<PriceIndex[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedIndexId, setExpandedIndexId] = useState<string | null>(null);
  const [selectedIndices, setSelectedIndices] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<'grid' | 'list' | 'compact'>('list');

  // Filter states
  const [filters, setFilters] = useState<FilterOptions>({
    searchQuery: '',
    statusFilter: 'all',
    sortBy: 'name',
    sortOrder: 'asc',
    valueRangeMin: '',
    valueRangeMax: '',
    baseValueMin: '',
    baseValueMax: '',
    monthRangeStart: '',
    monthRangeEnd: '',
    changePercentMin: '',
    changePercentMax: '',
    dataPointsMin: '',
    hasDescription: 'all',
  });

  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

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

  const fetchIndices = async () => {
    try {
      setIsLoading(true);
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

  // Calculate statistics for each index
  const getIndexStats = (index: PriceIndex) => {
    const values = index.monthlyValues;
    if (values.length === 0) {
      return {
        latestValue: 0,
        latestMonth: null,
        isProvisional: false,
        dataPoints: 0,
        changeFromBase: 0,
        changePercent: 0,
        monthlyChange: 0,
        monthlyChangePercent: 0,
        avgValue: 0,
        maxValue: 0,
        minValue: 0,
        trend: 'neutral' as 'up' | 'down' | 'neutral',
      };
    }

    const sortedValues = [...values].sort((a, b) => 
      new Date(b.month).getTime() - new Date(a.month).getTime()
    );

    const latestValue = sortedValues[0].value;
    const latestMonth = sortedValues[0].month;
    const isProvisional = sortedValues[0].isProvisional;
    const dataPoints = values.length;

    const changeFromBase = latestValue - index.baseValue;
    const changePercent = ((changeFromBase / index.baseValue) * 100);

    let monthlyChange = 0;
    let monthlyChangePercent = 0;
    if (sortedValues.length > 1) {
      const previousValue = sortedValues[1].value;
      monthlyChange = latestValue - previousValue;
      monthlyChangePercent = ((monthlyChange / previousValue) * 100);
    }

    const allValues = values.map(v => v.value);
    const avgValue = allValues.reduce((a, b) => a + b, 0) / allValues.length;
    const maxValue = Math.max(...allValues);
    const minValue = Math.min(...allValues);

    const trend = monthlyChange > 0 ? 'up' : monthlyChange < 0 ? 'down' : 'neutral';

    return {
      latestValue,
      latestMonth,
      isProvisional,
      dataPoints,
      changeFromBase,
      changePercent,
      monthlyChange,
      monthlyChangePercent,
      avgValue,
      maxValue,
      minValue,
      trend,
    };
  };

  // Filtered and sorted indices with advanced filtering
  const filteredAndSortedIndices = useMemo(() => {
    let result = [...indices];

    // Apply search filter
    if (filters.searchQuery) {
      const query = filters.searchQuery.toLowerCase();
      result = result.filter(index =>
        index.name.toLowerCase().includes(query) ||
        index.description?.toLowerCase().includes(query) ||
        index.id.toLowerCase().includes(query)
      );
    }

    // Apply status filter
    if (filters.statusFilter !== 'all') {
      result = result.filter(index => {
        const stats = getIndexStats(index);
        if (filters.statusFilter === 'no-data') return stats.dataPoints === 0;
        if (filters.statusFilter === 'final') return !stats.isProvisional && stats.dataPoints > 0;
        if (filters.statusFilter === 'provisional') return stats.isProvisional && stats.dataPoints > 0;
        return true;
      });
    }

    // Apply value range filter
    if (filters.valueRangeMin || filters.valueRangeMax) {
      result = result.filter(index => {
        const stats = getIndexStats(index);
        const min = filters.valueRangeMin ? parseFloat(filters.valueRangeMin) : -Infinity;
        const max = filters.valueRangeMax ? parseFloat(filters.valueRangeMax) : Infinity;
        return stats.latestValue >= min && stats.latestValue <= max;
      });
    }

    // Apply base value range filter
    if (filters.baseValueMin || filters.baseValueMax) {
      result = result.filter(index => {
        const min = filters.baseValueMin ? parseFloat(filters.baseValueMin) : -Infinity;
        const max = filters.baseValueMax ? parseFloat(filters.baseValueMax) : Infinity;
        return index.baseValue >= min && index.baseValue <= max;
      });
    }

    // Apply change percent filter
    if (filters.changePercentMin || filters.changePercentMax) {
      result = result.filter(index => {
        const stats = getIndexStats(index);
        const min = filters.changePercentMin ? parseFloat(filters.changePercentMin) : -Infinity;
        const max = filters.changePercentMax ? parseFloat(filters.changePercentMax) : Infinity;
        return stats.changePercent >= min && stats.changePercent <= max;
      });
    }

    // Apply data points filter
    if (filters.dataPointsMin) {
      result = result.filter(index => {
        const stats = getIndexStats(index);
        const min = parseInt(filters.dataPointsMin);
        return stats.dataPoints >= min;
      });
    }

    // Apply description filter
    if (filters.hasDescription !== 'all') {
      result = result.filter(index => {
        if (filters.hasDescription === 'yes') return !!index.description;
        if (filters.hasDescription === 'no') return !index.description;
        return true;
      });
    }

    // Apply month range filter
    if (filters.monthRangeStart && filters.monthRangeEnd) {
      result = result.filter(index => {
        const start = new Date(filters.monthRangeStart);
        const end = new Date(filters.monthRangeEnd);
        return index.monthlyValues.some(mv => {
          const mvDate = new Date(mv.month);
          return mvDate >= start && mvDate <= end;
        });
      });
    }

    // Apply sorting
    result.sort((a, b) => {
      let comparison = 0;
      const aStats = getIndexStats(a);
      const bStats = getIndexStats(b);

      switch (filters.sortBy) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'baseValue':
          comparison = a.baseValue - b.baseValue;
          break;
        case 'latestValue':
          comparison = aStats.latestValue - bStats.latestValue;
          break;
        case 'status':
          comparison = (aStats.isProvisional ? 1 : 0) - (bStats.isProvisional ? 1 : 0);
          break;
        case 'change':
          comparison = aStats.changePercent - bStats.changePercent;
          break;
        case 'dataPoints':
          comparison = aStats.dataPoints - bStats.dataPoints;
          break;
        default:
          comparison = 0;
      }

      return filters.sortOrder === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [indices, filters]);

  // Calculate overall statistics
  const overallStats = useMemo(() => {
    const totalIndices = filteredAndSortedIndices.length;
    const indicesWithData = filteredAndSortedIndices.filter(i => i.monthlyValues.length > 0).length;
    const provisionalCount = filteredAndSortedIndices.filter(i => {
      const stats = getIndexStats(i);
      return stats.isProvisional && stats.dataPoints > 0;
    }).length;
    const finalCount = indicesWithData - provisionalCount;

    const avgChangePercent = filteredAndSortedIndices
      .filter(i => i.monthlyValues.length > 0)
      .reduce((sum, i) => sum + getIndexStats(i).changePercent, 0) / (indicesWithData || 1);

    const increasingCount = filteredAndSortedIndices.filter(i => {
      const stats = getIndexStats(i);
      return stats.trend === 'up';
    }).length;

    const decreasingCount = filteredAndSortedIndices.filter(i => {
      const stats = getIndexStats(i);
      return stats.trend === 'down';
    }).length;

    return {
      totalIndices,
      indicesWithData,
      provisionalCount,
      finalCount,
      avgChangePercent,
      increasingCount,
      decreasingCount,
    };
  }, [filteredAndSortedIndices]);

  const updateFilter = (key: keyof FilterOptions, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const clearAllFilters = () => {
    setFilters({
      searchQuery: '',
      statusFilter: 'all',
      sortBy: 'name',
      sortOrder: 'asc',
      valueRangeMin: '',
      valueRangeMax: '',
      baseValueMin: '',
      baseValueMax: '',
      monthRangeStart: '',
      monthRangeEnd: '',
      changePercentMin: '',
      changePercentMax: '',
      dataPointsMin: '',
      hasDescription: 'all',
    });
  };

  const toggleSortOrder = () => {
    updateFilter('sortOrder', filters.sortOrder === 'asc' ? 'desc' : 'asc');
  };

  const hasActiveFilters = 
    filters.searchQuery ||
    filters.statusFilter !== 'all' ||
    filters.valueRangeMin ||
    filters.valueRangeMax ||
    filters.baseValueMin ||
    filters.baseValueMax ||
    filters.changePercentMin ||
    filters.changePercentMax ||
    filters.dataPointsMin ||
    filters.hasDescription !== 'all' ||
    filters.monthRangeStart ||
    filters.monthRangeEnd;

  const toggleIndexSelection = (indexId: string) => {
    const newSelection = new Set(selectedIndices);
    if (newSelection.has(indexId)) {
      newSelection.delete(indexId);
    } else {
      newSelection.add(indexId);
    }
    setSelectedIndices(newSelection);
  };

  const selectAllIndices = () => {
    if (selectedIndices.size === filteredAndSortedIndices.length) {
      setSelectedIndices(new Set());
    } else {
      setSelectedIndices(new Set(filteredAndSortedIndices.map(i => i.id)));
    }
  };

  const exportToCSV = () => {
    const headers = ['Name', 'Base Value', 'Latest Value', 'Status', 'Change %', 'Data Points', 'Latest Month'];
    const rows = filteredAndSortedIndices.map(index => {
      const stats = getIndexStats(index);
      return [
        index.name,
        index.baseValue.toString(),
        stats.latestValue.toString(),
        stats.isProvisional ? 'Provisional' : 'Final',
        stats.changePercent.toFixed(2),
        stats.dataPoints.toString(),
        stats.latestMonth ? format(new Date(stats.latestMonth), 'MMM yyyy') : 'N/A',
      ];
    });

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `price-indices-${format(toISTDate(new Date()), 'yyyy-MM-dd')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-64">
        <LoadingSpinner size="lg" text="Loading price indices..." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <BackButton href="/indices" label="Back to Indices" variant="outline" />
        <div className="flex-1">
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg">
              <Activity className="h-7 w-7 text-white" />
            </div>
            Detailed Indices Analysis
          </h1>
          <p className="text-gray-600 mt-2">
            Advanced search, filtering, and analysis tools for price indices
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchIndices}
            disabled={isLoading}
            title="Refresh data"
          >
            <RefreshCcw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={exportToCSV}
            disabled={filteredAndSortedIndices.length === 0}
          >
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      {error && <StatusMessage type="error" title="Error" message={error} />}

      {/* Statistics Dashboard */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow bg-gradient-to-br from-blue-50 to-blue-100">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-blue-900 flex items-center gap-2">
              <Database className="h-4 w-4" />
              Total Indices
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-900">{overallStats.totalIndices}</div>
            <p className="text-xs text-blue-700 mt-1">
              {overallStats.indicesWithData} with data • {overallStats.totalIndices - overallStats.indicesWithData} empty
            </p>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow bg-gradient-to-br from-green-50 to-green-100">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-green-900 flex items-center gap-2">
              <CheckCircle className="h-4 w-4" />
              Final Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-900">{overallStats.finalCount}</div>
            <p className="text-xs text-green-700 mt-1">
              {overallStats.indicesWithData > 0 
                ? ((overallStats.finalCount / overallStats.indicesWithData) * 100).toFixed(1)
                : 0}% of indices with data
            </p>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow bg-gradient-to-br from-orange-50 to-orange-100">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-orange-900 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Provisional
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-orange-900">{overallStats.provisionalCount}</div>
            <p className="text-xs text-orange-700 mt-1">
              Awaiting finalization
            </p>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow bg-gradient-to-br from-purple-50 to-purple-100">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-purple-900 flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Average Change
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-purple-900">
              {overallStats.avgChangePercent.toFixed(2)}%
            </div>
            <p className="text-xs text-purple-700 mt-1">
              ↑ {overallStats.increasingCount} • ↓ {overallStats.decreasingCount}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Advanced Filters */}
      <Card className="border-0 shadow-lg">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <SlidersHorizontal className="h-5 w-5" />
              Search & Filters
            </CardTitle>
            <div className="flex items-center gap-2">
              {hasActiveFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearAllFilters}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                >
                  <X className="h-4 w-4 mr-1" />
                  Clear All
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
              >
                <Filter className="h-4 w-4 mr-2" />
                {showAdvancedFilters ? 'Hide' : 'Show'} Advanced
              </Button>
            </div>
          </div>
          <CardDescription>
            Showing {filteredAndSortedIndices.length} of {indices.length} indices
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Basic Filters Row */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
            {/* Search */}
            <div className="space-y-2">
              <Label htmlFor="search" className="text-sm font-medium flex items-center gap-2">
                <Search className="h-3 w-3" />
                Search
              </Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  id="search"
                  type="text"
                  placeholder="Search by name, description..."
                  value={filters.searchQuery}
                  onChange={(e) => updateFilter('searchQuery', e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            {/* Status Filter */}
            <div className="space-y-2">
              <Label htmlFor="status-filter" className="text-sm font-medium flex items-center gap-2">
                <CheckCircle className="h-3 w-3" />
                Status
              </Label>
              <Select value={filters.statusFilter} onValueChange={(val: any) => updateFilter('statusFilter', val)}>
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
              <Label htmlFor="sort-by" className="text-sm font-medium flex items-center gap-2">
                <ArrowUpDown className="h-3 w-3" />
                Sort By
              </Label>
              <div className="flex gap-2">
                <Select value={filters.sortBy} onValueChange={(val: any) => updateFilter('sortBy', val)}>
                  <SelectTrigger id="sort-by">
                    <SelectValue placeholder="Sort by..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="name">Name</SelectItem>
                    <SelectItem value="baseValue">Base Value</SelectItem>
                    <SelectItem value="latestValue">Latest Value</SelectItem>
                    <SelectItem value="status">Status</SelectItem>
                    <SelectItem value="change">% Change</SelectItem>
                    <SelectItem value="dataPoints">Data Points</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={toggleSortOrder}
                  title={`Sort ${filters.sortOrder === 'asc' ? 'Descending' : 'Ascending'}`}
                >
                  <ArrowUpDown className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* View Mode */}
            <div className="space-y-2">
              <Label className="text-sm font-medium flex items-center gap-2">
                <Eye className="h-3 w-3" />
                View Mode
              </Label>
              <Select value={viewMode} onValueChange={(val: any) => setViewMode(val)}>
                <SelectTrigger>
                  <SelectValue placeholder="View mode" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="list">List View</SelectItem>
                  <SelectItem value="grid">Grid View</SelectItem>
                  <SelectItem value="compact">Compact View</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Advanced Filters */}
          {showAdvancedFilters && (
            <>
              <Separator className="my-4" />
              <Tabs defaultValue="values" className="w-full">
                <TabsList className="grid w-full grid-cols-4">
                  <TabsTrigger value="values">Values</TabsTrigger>
                  <TabsTrigger value="changes">Changes</TabsTrigger>
                  <TabsTrigger value="dates">Dates</TabsTrigger>
                  <TabsTrigger value="other">Other</TabsTrigger>
                </TabsList>
                
                <TabsContent value="values" className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Latest Value Range */}
                    <div className="space-y-2">
                      <Label className="text-sm font-medium flex items-center gap-2">
                        <Hash className="h-3 w-3" />
                        Latest Value Range
                      </Label>
                      <div className="flex gap-2">
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="Min"
                          value={filters.valueRangeMin}
                          onChange={(e) => updateFilter('valueRangeMin', e.target.value)}
                        />
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="Max"
                          value={filters.valueRangeMax}
                          onChange={(e) => updateFilter('valueRangeMax', e.target.value)}
                        />
                      </div>
                    </div>

                    {/* Base Value Range */}
                    <div className="space-y-2">
                      <Label className="text-sm font-medium flex items-center gap-2">
                        <Hash className="h-3 w-3" />
                        Base Value Range
                      </Label>
                      <div className="flex gap-2">
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="Min"
                          value={filters.baseValueMin}
                          onChange={(e) => updateFilter('baseValueMin', e.target.value)}
                        />
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="Max"
                          value={filters.baseValueMax}
                          onChange={(e) => updateFilter('baseValueMax', e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="changes" className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Change Percent Range */}
                    <div className="space-y-2">
                      <Label className="text-sm font-medium flex items-center gap-2">
                        <Percent className="h-3 w-3" />
                        Change Percent Range
                      </Label>
                      <div className="flex gap-2">
                        <Input
                          type="number"
                          step="0.1"
                          placeholder="Min %"
                          value={filters.changePercentMin}
                          onChange={(e) => updateFilter('changePercentMin', e.target.value)}
                        />
                        <Input
                          type="number"
                          step="0.1"
                          placeholder="Max %"
                          value={filters.changePercentMax}
                          onChange={(e) => updateFilter('changePercentMax', e.target.value)}
                        />
                      </div>
                    </div>

                    {/* Data Points Minimum */}
                    <div className="space-y-2">
                      <Label className="text-sm font-medium flex items-center gap-2">
                        <Database className="h-3 w-3" />
                        Minimum Data Points
                      </Label>
                      <Input
                        type="number"
                        placeholder="Min data points"
                        value={filters.dataPointsMin}
                        onChange={(e) => updateFilter('dataPointsMin', e.target.value)}
                      />
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="dates" className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Month Range */}
                    <div className="space-y-2">
                      <Label className="text-sm font-medium flex items-center gap-2">
                        <Calendar className="h-3 w-3" />
                        Data Available Between
                      </Label>
                      <div className="flex gap-2">
                        <Input
                          type="month"
                          value={filters.monthRangeStart ? format(new Date(filters.monthRangeStart), 'yyyy-MM') : ''}
                          onChange={(e) => updateFilter('monthRangeStart', e.target.value ? e.target.value + '-01' : '')}
                          placeholder="Start"
                        />
                        <Input
                          type="month"
                          value={filters.monthRangeEnd ? format(new Date(filters.monthRangeEnd), 'yyyy-MM') : ''}
                          onChange={(e) => updateFilter('monthRangeEnd', e.target.value ? e.target.value + '-01' : '')}
                          placeholder="End"
                        />
                      </div>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="other" className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Has Description */}
                    <div className="space-y-2">
                      <Label className="text-sm font-medium flex items-center gap-2">
                        <FileText className="h-3 w-3" />
                        Has Description
                      </Label>
                      <Select value={filters.hasDescription} onValueChange={(val: any) => updateFilter('hasDescription', val)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Description filter" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All</SelectItem>
                          <SelectItem value="yes">With Description</SelectItem>
                          <SelectItem value="no">Without Description</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </>
          )}

          {/* Active Filters Summary */}
          {hasActiveFilters && (
            <div className="mt-4 pt-4 border-t">
              <div className="flex flex-wrap gap-2">
                <span className="text-sm font-medium text-gray-700">Active Filters:</span>
                {filters.searchQuery && (
                  <Badge variant="secondary">Search: {filters.searchQuery}</Badge>
                )}
                {filters.statusFilter !== 'all' && (
                  <Badge variant="secondary">Status: {filters.statusFilter}</Badge>
                )}
                {filters.valueRangeMin && (
                  <Badge variant="secondary">Min Value: {filters.valueRangeMin}</Badge>
                )}
                {filters.valueRangeMax && (
                  <Badge variant="secondary">Max Value: {filters.valueRangeMax}</Badge>
                )}
                {filters.baseValueMin && (
                  <Badge variant="secondary">Min Base: {filters.baseValueMin}</Badge>
                )}
                {filters.baseValueMax && (
                  <Badge variant="secondary">Max Base: {filters.baseValueMax}</Badge>
                )}
                {filters.changePercentMin && (
                  <Badge variant="secondary">Min Change: {filters.changePercentMin}%</Badge>
                )}
                {filters.changePercentMax && (
                  <Badge variant="secondary">Max Change: {filters.changePercentMax}%</Badge>
                )}
                {filters.dataPointsMin && (
                  <Badge variant="secondary">Min Data Points: {filters.dataPointsMin}</Badge>
                )}
                {filters.hasDescription !== 'all' && (
                  <Badge variant="secondary">
                    {filters.hasDescription === 'yes' ? 'With Description' : 'No Description'}
                  </Badge>
                )}
                {filters.monthRangeStart && filters.monthRangeEnd && (
                  <Badge variant="secondary">
                    {format(new Date(filters.monthRangeStart), 'MMM yyyy')} - {format(new Date(filters.monthRangeEnd), 'MMM yyyy')}
                  </Badge>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bulk Actions */}
      {selectedIndices.size > 0 && (
        <Card className="border-0 shadow-lg bg-gradient-to-r from-indigo-50 to-purple-50">
          <CardContent className="py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Checkbox
                  checked={selectedIndices.size === filteredAndSortedIndices.length}
                  onCheckedChange={selectAllIndices}
                />
                <span className="text-sm font-medium">
                  {selectedIndices.size} of {filteredAndSortedIndices.length} selected
                </span>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setSelectedIndices(new Set())}>
                  Clear Selection
                </Button>
                <Button variant="outline" size="sm" onClick={exportToCSV}>
                  <Download className="h-4 w-4 mr-2" />
                  Export Selected
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Indices List */}
      <div className={
        viewMode === 'grid' 
          ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'
          : 'space-y-4'
      }>
        {filteredAndSortedIndices.length === 0 ? (
          <Card className="border-0 shadow-lg">
            <CardContent className="py-12">
              <div className="flex flex-col items-center gap-3 text-gray-500">
                <Filter className="h-12 w-12" />
                <p className="font-medium text-lg">No indices match your filters</p>
                <p className="text-sm">Try adjusting your search or filter criteria</p>
                {hasActiveFilters && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={clearAllFilters}
                    className="mt-2"
                  >
                    Clear All Filters
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ) : (
          filteredAndSortedIndices.map((index) => {
            const stats = getIndexStats(index);
            const isExpanded = expandedIndexId === index.id;
            const isSelected = selectedIndices.has(index.id);

            return (
              <Card 
                key={index.id} 
                className={`border-0 shadow-lg hover:shadow-xl transition-all ${
                  isSelected ? 'ring-2 ring-blue-500' : ''
                } ${viewMode === 'compact' ? 'p-2' : ''}`}
              >
                <CardHeader className={viewMode === 'compact' ? 'pb-2' : ''}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 flex-1">
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleIndexSelection(index.id)}
                      />
                      <div className="flex-1 min-w-0">
                        <CardTitle className={`flex items-center gap-2 ${viewMode === 'compact' ? 'text-base' : 'text-lg'}`}>
                          {index.name}
                          {stats.isProvisional && stats.dataPoints > 0 ? (
                            <Badge variant="secondary" className="text-xs">
                              <AlertTriangle className="h-3 w-3 mr-1" />
                              Provisional
                            </Badge>
                          ) : stats.dataPoints > 0 ? (
                            <Badge variant="default" className="text-xs">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Final
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs">
                              No Data
                            </Badge>
                          )}
                        </CardTitle>
                        {index.description && viewMode !== 'compact' && (
                          <CardDescription className="mt-1 text-xs line-clamp-2">
                            {index.description}
                          </CardDescription>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setExpandedIndexId(isExpanded ? null : index.id)}
                    >
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className={viewMode === 'compact' ? 'pt-2' : ''}>
                  <div className={`grid ${viewMode === 'grid' ? 'grid-cols-2' : 'grid-cols-2 md:grid-cols-4'} gap-3`}>
                    {/* Base Value */}
                    <div className="space-y-1">
                      <p className="text-xs text-gray-500 font-medium">Base Value</p>
                      <p className="text-sm font-semibold text-gray-900">
                        {index.baseValue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                      </p>
                    </div>

                    {/* Latest Value */}
                    <div className="space-y-1">
                      <p className="text-xs text-gray-500 font-medium">Latest Value</p>
                      <p className="text-sm font-semibold text-gray-900">
                        {stats.dataPoints > 0 
                          ? stats.latestValue.toLocaleString('en-IN', { maximumFractionDigits: 2 })
                          : 'N/A'
                        }
                      </p>
                    </div>

                    {/* Change */}
                    <div className="space-y-1">
                      <p className="text-xs text-gray-500 font-medium">Change from Base</p>
                      <div className="flex items-center gap-1">
                        {stats.trend === 'up' && <TrendingUp className="h-3 w-3 text-green-600" />}
                        {stats.trend === 'down' && <TrendingDown className="h-3 w-3 text-red-600" />}
                        <p className={`text-sm font-semibold ${
                          stats.changePercent > 0 ? 'text-green-600' : 
                          stats.changePercent < 0 ? 'text-red-600' : 
                          'text-gray-600'
                        }`}>
                          {stats.dataPoints > 0 
                            ? `${stats.changePercent > 0 ? '+' : ''}${stats.changePercent.toFixed(2)}%`
                            : 'N/A'
                          }
                        </p>
                      </div>
                    </div>

                    {/* Data Points */}
                    <div className="space-y-1">
                      <p className="text-xs text-gray-500 font-medium">Data Points</p>
                      <p className="text-sm font-semibold text-gray-900">
                        {stats.dataPoints}
                      </p>
                    </div>
                  </div>

                  {/* Expanded Details */}
                  {isExpanded && (
                    <div className="mt-4 pt-4 border-t space-y-3">
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                        <div>
                          <p className="text-xs text-gray-500">Latest Month</p>
                          <p className="font-medium">
                            {stats.latestMonth ? format(new Date(stats.latestMonth), 'MMM yyyy') : 'N/A'}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">Monthly Change</p>
                          <p className={`font-medium ${
                            stats.monthlyChangePercent > 0 ? 'text-green-600' : 
                            stats.monthlyChangePercent < 0 ? 'text-red-600' : 
                            'text-gray-600'
                          }`}>
                            {stats.dataPoints > 1 
                              ? `${stats.monthlyChangePercent > 0 ? '+' : ''}${stats.monthlyChangePercent.toFixed(2)}%`
                              : 'N/A'
                            }
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">Average Value</p>
                          <p className="font-medium">
                            {stats.dataPoints > 0 
                              ? stats.avgValue.toLocaleString('en-IN', { maximumFractionDigits: 2 })
                              : 'N/A'
                            }
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">Max Value</p>
                          <p className="font-medium">
                            {stats.dataPoints > 0 
                              ? stats.maxValue.toLocaleString('en-IN', { maximumFractionDigits: 2 })
                              : 'N/A'
                            }
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">Min Value</p>
                          <p className="font-medium">
                            {stats.dataPoints > 0 
                              ? stats.minValue.toLocaleString('en-IN', { maximumFractionDigits: 2 })
                              : 'N/A'
                            }
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">ID</p>
                          <p className="font-mono text-xs truncate" title={index.id}>
                            {index.id}
                          </p>
                        </div>
                      </div>

                      {/* Recent Values */}
                      {stats.dataPoints > 0 && (
                        <div className="space-y-2">
                          <p className="text-xs font-medium text-gray-700">Recent Values (Last 6 months)</p>
                          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
                            {index.monthlyValues
                              .sort((a, b) => new Date(b.month).getTime() - new Date(a.month).getTime())
                              .slice(0, 6)
                              .map((mv) => (
                                <div 
                                  key={mv.id}
                                  className="bg-gray-50 rounded p-2 border border-gray-200"
                                >
                                  <p className="text-xs text-gray-600">
                                    {format(new Date(mv.month), 'MMM yy')}
                                  </p>
                                  <p className="text-sm font-semibold text-gray-900">
                                    {mv.value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                                  </p>
                                  {mv.isProvisional && (
                                    <Badge variant="secondary" className="text-xs mt-1">P</Badge>
                                  )}
                                </div>
                              ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
