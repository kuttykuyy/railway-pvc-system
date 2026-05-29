
'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { StatusMessage } from '@/components/ui/status-message';
import { 
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import { 
  Building2, 
  Plus, 
  Eye, 
  Calendar, 
  User, 
  FileText, 
  Receipt, 
  TrendingUp, 
  Clock, 
  Trash2, 
  Search,
  Filter,
  MapPin,
  IndianRupee,
  BarChart3,
  CheckCircle,
  AlertTriangle,
  ArrowUpRight,
  LayoutGrid,
  LayoutList
} from 'lucide-react';
import Link from 'next/link';
import { format } from 'date-fns';
import { toISTDate } from '@/lib/ist-utils';
import { PostingDetailsNotice } from '@/components/posting-details-notice';

interface Contract {
  id: string;
  agreementNo: string;
  contractorName: string;
  workDescription: string;
  dateOfOpening: Date;
  baseMonth: Date;
  loaNo: string | null;
  user?: {
    name: string | null;
    email: string;
  } | null;
  _count: {
    bills: number;
    pvcCalculations: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

interface Bill {
  id: string;
  billNo: string;
  billAmount: number;
  dateOfMeasurement: Date;
  quarter: string;
  createdAt: Date;
  pvcCalculation: {
    totalPvc: number;
    cumulativePvc: number;
  } | null;
}

interface RecentBillsDialogProps {
  contract: Contract;
}

function RecentBillsDialog({ contract }: RecentBillsDialogProps) {
  const [bills, setBills] = useState<Bill[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  const fetchRecentBills = async () => {
    if (!isOpen) return;
    
    setIsLoading(true);
    setError('');
    
    try {
      const response = await fetch(`/api/bills?contractId=${contract.id}`);
      if (!response.ok) {
        throw new Error('Failed to fetch bills');
      }
      
      const billsData = await response.json();
      // Handle both paginated response and direct array
      const billsArray = Array.isArray(billsData) ? billsData : (billsData.data || []);
      setBills(billsArray.slice(0, 10));
    } catch (error: any) {
      console.error('Error fetching bills:', error);
      setError(error.message || 'Failed to fetch bills');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRecentBills();
  }, [isOpen]);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button 
          variant="outline" 
          size="sm" 
          className="bg-gradient-to-r from-emerald-50 to-green-50 hover:from-emerald-100 hover:to-green-100 border-emerald-200 text-emerald-700"
        >
          <Receipt className="h-4 w-4 mr-2" />
          View Bills ({contract._count.bills})
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3 text-2xl">
            <div className="bg-emerald-100 p-2 rounded-lg">
              <Receipt className="h-6 w-6 text-emerald-600" />
            </div>
            Bills for {contract.agreementNo}
          </DialogTitle>
          <DialogDescription className="flex items-center gap-4 text-sm">
            <span>{contract.contractorName}</span>
            <span>•</span>
            <span>Total: {contract._count.bills} bills</span>
            <span>•</span>
            <span>PVC Calculated: {contract._count.pvcCalculations}</span>
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          {isLoading ? (
            <div className="flex justify-center items-center py-12">
              <LoadingSpinner size="lg" text="Loading bills..." />
            </div>
          ) : error ? (
            <StatusMessage type="error" title="Error" message={error} />
          ) : bills.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="h-16 w-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-900 mb-3">No bills found</h3>
              <p className="text-gray-600 mb-6">No bills have been created for this contract yet.</p>
              <Button asChild>
                <Link href={`/bills/new?contractId=${contract.id}`}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create First Bill
                </Link>
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid gap-4">
                {bills.map((bill) => (
                  <Card key={bill.id} className="border border-gray-200 hover:border-blue-300 hover:shadow-md transition-all duration-200">
                    <CardContent className="p-5">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-3">
                            <h4 className="text-lg font-semibold text-blue-900">{bill.billNo}</h4>
                            <Badge variant="outline" className="text-xs font-medium">
                              {bill.quarter}
                            </Badge>
                            {bill.pvcCalculation && (
                              <Badge className="text-xs bg-green-100 text-green-700 border-green-200">
                                PVC ✓
                              </Badge>
                            )}
                          </div>
                          
                          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                            <div className="bg-blue-50 p-3 rounded-lg">
                              <p className="text-xs text-blue-600 font-medium">Bill Amount</p>
                              <p className="text-lg font-bold text-blue-800">
                                ₹{bill.billAmount.toLocaleString('en-IN')}
                              </p>
                            </div>
                            
                            <div className="bg-gray-50 p-3 rounded-lg">
                              <p className="text-xs text-gray-600 font-medium">Measurement Date</p>
                              <p className="text-sm font-semibold text-gray-800">
                                {format(new Date(bill.dateOfMeasurement), 'dd MMM yyyy')}
                              </p>
                            </div>
                            
                            {bill.pvcCalculation && (
                              <>
                                <div className="bg-green-50 p-3 rounded-lg">
                                  <p className="text-xs text-green-600 font-medium">PVC Amount</p>
                                  <p className="text-lg font-bold text-green-800">
                                    ₹{bill.pvcCalculation.totalPvc.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                                  </p>
                                </div>
                                
                                <div className="bg-purple-50 p-3 rounded-lg">
                                  <p className="text-xs text-purple-600 font-medium">Cumulative PVC</p>
                                  <p className="text-lg font-bold text-purple-800">
                                    ₹{bill.pvcCalculation.cumulativePvc.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                                  </p>
                                </div>
                              </>
                            )}
                          </div>
                          
                          <div className="flex items-center gap-4 mt-4 pt-3 border-t border-gray-100 text-xs text-gray-500">
                            <div className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              Created: {format(toISTDate(new Date(bill.createdAt)), 'dd MMM yyyy')}
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex gap-2 ml-6">
                          <Button asChild variant="outline" size="sm" className="hover:bg-blue-50">
                            <Link href={`/bills/${bill.id}`}>
                              <Eye className="h-4 w-4" />
                            </Link>
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
              
              {contract._count.bills > 10 && (
                <div className="text-center pt-6 border-t border-gray-200">
                  <Button asChild variant="link" className="text-blue-600 hover:text-blue-800">
                    <Link href={`/contracts/${contract.id}`}>
                      <ArrowUpRight className="h-4 w-4 mr-1" />
                      View All {contract._count.bills} Bills
                    </Link>
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function ContractsPage() {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [filteredContracts, setFilteredContracts] = useState<Contract[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleteLoading, setDeleteLoading] = useState<string | null>(null);
  
  // View mode state
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  
  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('newest');

  // Load view mode preference from localStorage
  useEffect(() => {
    const savedViewMode = localStorage.getItem('contractsViewMode');
    if (savedViewMode === 'grid' || savedViewMode === 'table') {
      setViewMode(savedViewMode);
    }
  }, []);

  // Save view mode preference to localStorage
  const handleViewModeChange = (mode: 'grid' | 'table') => {
    setViewMode(mode);
    localStorage.setItem('contractsViewMode', mode);
  };

  useEffect(() => {
    fetchContracts();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [contracts, searchTerm, statusFilter, sortBy]);

  const fetchContracts = async () => {
    try {
      const response = await fetch('/api/contracts');
      if (!response.ok) {
        throw new Error('Failed to fetch contracts');
      }
      
      const contractsData = await response.json();
      setContracts(contractsData);
    } catch (error: any) {
      console.error('Error fetching contracts:', error);
      setError(error.message || 'Failed to fetch contracts');
    } finally {
      setIsLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...contracts];
    
    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(contract =>
        contract.agreementNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
        contract.contractorName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        contract.workDescription.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    
    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(contract => {
        switch (statusFilter) {
          case 'active':
            return contract._count.bills > 0;
          case 'inactive':
            return contract._count.bills === 0;
          case 'with-pvc':
            return contract._count.pvcCalculations > 0;
          default:
            return true;
        }
      });
    }
    
    // Sort
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'newest':
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case 'oldest':
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case 'name':
          return a.agreementNo.localeCompare(b.agreementNo);
        case 'contractor':
          return a.contractorName.localeCompare(b.contractorName);
        case 'bills':
          return b._count.bills - a._count.bills;
        default:
          return 0;
      }
    });
    
    setFilteredContracts(filtered);
  };

  const handleDeleteContract = async (contractId: string) => {
    setDeleteLoading(contractId);
    try {
      const response = await fetch(`/api/contracts/${contractId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete contract');
      }

      setContracts(contracts.filter(contract => contract.id !== contractId));
    } catch (error: any) {
      console.error('Error deleting contract:', error);
      setError(error.message || 'Failed to delete contract');
    } finally {
      setDeleteLoading(null);
    }
  };

  const getStatusBadge = (contract: Contract) => {
    if (contract._count.pvcCalculations > 0) {
      return (
        <Badge className="bg-green-100 text-green-700 border-green-200">
          <CheckCircle className="h-3 w-3 mr-1" />
          Active with PVC
        </Badge>
      );
    } else if (contract._count.bills > 0) {
      return (
        <Badge className="bg-blue-100 text-blue-700 border-blue-200">
          <BarChart3 className="h-3 w-3 mr-1" />
          Active
        </Badge>
      );
    } else {
      return (
        <Badge variant="outline" className="bg-gray-50 text-gray-600 border-gray-300">
          <AlertTriangle className="h-3 w-3 mr-1" />
          No Bills
        </Badge>
      );
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-64">
        <LoadingSpinner size="lg" text="Loading contracts..." />
      </div>
    );
  }

  const stats = {
    total: contracts.length,
    active: contracts.filter(c => c._count.bills > 0).length,
    withPvc: contracts.filter(c => c._count.pvcCalculations > 0).length,
    totalBills: contracts.reduce((sum, c) => sum + c._count.bills, 0)
  };

  return (
    <div className="space-y-4 sm:space-y-6 px-3 sm:px-0">
      {/* Posting Details Notice for Railway Officials */}
      <PostingDetailsNotice />
      
      {/* Enhanced Header */}
      <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white p-4 sm:p-6 md:p-8 rounded-xl sm:rounded-2xl shadow-2xl">
        <div className="flex flex-col gap-4 sm:gap-6">
          <div className="flex-1">
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold flex items-center gap-3 sm:gap-4">
              <div className="bg-white/20 p-2 sm:p-3 rounded-lg sm:rounded-xl">
                <Building2 className="h-6 w-6 sm:h-8 sm:w-8" />
              </div>
              <span className="leading-tight">Contract Management</span>
            </h1>
            <p className="text-sm sm:text-base md:text-lg text-white/90 mt-2 sm:mt-3 max-w-2xl">
              Comprehensive management of railway contracts with automatic PVC calculations, 
              bill tracking, and performance analytics
            </p>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 w-full sm:w-auto">
            <Button asChild className="bg-white text-blue-600 hover:bg-white/90 font-semibold shadow-lg w-full sm:w-auto" size="default">
              <Link href="/contracts/new">
                <Plus className="h-4 w-4 sm:h-5 sm:w-5 mr-2" />
                New Contract
              </Link>
            </Button>
          </div>
        </div>
      </div>

      {/* Statistics Dashboard */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 md:gap-6">
        <Card className="border-0 shadow-xl bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 hover:shadow-2xl transition-all duration-300">
          <CardContent className="p-4 sm:p-5 md:p-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center sm:justify-between gap-3">
              <div className="space-y-1 sm:space-y-2 w-full">
                <p className="text-xs sm:text-sm font-medium text-blue-600 uppercase tracking-wide">Total Contracts</p>
                <p className="text-2xl sm:text-3xl font-bold text-blue-900">{stats.total}</p>
                <p className="text-xs text-blue-700">All registered</p>
              </div>
              <div className="bg-blue-500/20 p-2 sm:p-3 rounded-xl sm:rounded-2xl">
                <Building2 className="h-6 w-6 sm:h-8 sm:w-8 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-xl bg-gradient-to-br from-green-50 via-emerald-50 to-teal-50 hover:shadow-2xl transition-all duration-300">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="space-y-2">
                <p className="text-sm font-medium text-green-600 uppercase tracking-wide">Active Contracts</p>
                <p className="text-3xl font-bold text-green-900">{stats.active}</p>
                <p className="text-xs text-green-700">With bills</p>
              </div>
              <div className="bg-green-500/20 p-3 rounded-2xl">
                <CheckCircle className="h-8 w-8 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-xl bg-gradient-to-br from-purple-50 via-violet-50 to-fuchsia-50 hover:shadow-2xl transition-all duration-300">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="space-y-2">
                <p className="text-sm font-medium text-purple-600 uppercase tracking-wide">PVC Enabled</p>
                <p className="text-3xl font-bold text-purple-900">{stats.withPvc}</p>
                <p className="text-xs text-purple-700">With calculations</p>
              </div>
              <div className="bg-purple-500/20 p-3 rounded-2xl">
                <TrendingUp className="h-8 w-8 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-xl bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-50 hover:shadow-2xl transition-all duration-300">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="space-y-2">
                <p className="text-sm font-medium text-orange-600 uppercase tracking-wide">Total Bills</p>
                <p className="text-3xl font-bold text-orange-900">{stats.totalBills}</p>
                <p className="text-xs text-orange-700">All contracts</p>
              </div>
              <div className="bg-orange-500/20 p-3 rounded-2xl">
                <Receipt className="h-8 w-8 text-orange-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters and Search */}
      <Card className="border-0 shadow-lg">
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Filter className="h-4 w-4 sm:h-5 sm:w-5" />
            Search & Filter Contracts
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            Find and organize contracts using advanced filters
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 sm:p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Search</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  placeholder="Agreement, contractor, or work..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Status</label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Contracts</SelectItem>
                  <SelectItem value="active">Active (with bills)</SelectItem>
                  <SelectItem value="inactive">No Bills</SelectItem>
                  <SelectItem value="with-pvc">With PVC Calculations</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Sort By</label>
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Newest First</SelectItem>
                  <SelectItem value="oldest">Oldest First</SelectItem>
                  <SelectItem value="name">Agreement Number</SelectItem>
                  <SelectItem value="contractor">Contractor Name</SelectItem>
                  <SelectItem value="bills">Most Bills First</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">View Mode</label>
              <div className="flex gap-2">
                <Button
                  variant={viewMode === 'grid' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleViewModeChange('grid')}
                  className="flex-1"
                >
                  <LayoutGrid className="h-4 w-4 mr-1" />
                  Grid
                </Button>
                <Button
                  variant={viewMode === 'table' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleViewModeChange('table')}
                  className="flex-1"
                >
                  <LayoutList className="h-4 w-4 mr-1" />
                  Table
                </Button>
              </div>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Results</label>
              <div className="bg-gray-100 px-3 py-2 rounded-lg text-sm">
                Showing {filteredContracts.length} of {contracts.length} contracts
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {error && (
        <StatusMessage type="error" title="Error" message={error} />
      )}

      {/* Contracts Display */}
      {filteredContracts.length === 0 ? (
        <Card className="border-0 shadow-lg">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Building2 className="h-16 w-16 text-gray-400 mb-6" />
            <h3 className="text-xl font-semibold text-gray-900 mb-3">
              {contracts.length === 0 ? 'No contracts yet' : 'No contracts match your filters'}
            </h3>
            <p className="text-gray-600 text-center mb-8 max-w-md">
              {contracts.length === 0 
                ? 'Get started by adding your first railway contract to begin PVC calculations.'
                : 'Try adjusting your search terms or filters to find the contracts you\'re looking for.'
              }
            </p>
            {contracts.length === 0 ? (
              <Button asChild size="lg">
                <Link href="/contracts/new">
                  <Plus className="h-5 w-5 mr-2" />
                  Create First Contract
                </Link>
              </Button>
            ) : (
              <Button variant="outline" onClick={() => {
                setSearchTerm('');
                setStatusFilter('all');
                setSortBy('newest');
              }}>
                Clear All Filters
              </Button>
            )}
          </CardContent>
        </Card>
      ) : viewMode === 'grid' ? (
        // Grid View
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {filteredContracts.map((contract) => (
            <Card key={contract.id} className="border-0 shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-[1.02] bg-gradient-to-br from-white to-gray-50">
              <CardHeader className="pb-4">
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
                  <div className="flex-1">
                    <div className="flex items-start justify-between mb-3">
                      <CardTitle className="text-xl text-blue-900">
                        {contract.agreementNo}
                      </CardTitle>
                      {getStatusBadge(contract)}
                    </div>
                    <CardDescription className="text-sm leading-relaxed line-clamp-2">
                      {contract.workDescription}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="bg-gradient-to-br from-blue-50 to-indigo-50 p-4 rounded-xl">
                    <div className="flex items-center gap-2 mb-2">
                      <User className="h-4 w-4 text-blue-600" />
                      <span className="text-sm font-medium text-blue-600">Contractor</span>
                    </div>
                    <p className="font-semibold text-gray-900">{contract.contractorName}</p>
                  </div>
                  
                  <div className="bg-gradient-to-br from-green-50 to-emerald-50 p-4 rounded-xl">
                    <div className="flex items-center gap-2 mb-2">
                      <Calendar className="h-4 w-4 text-green-600" />
                      <span className="text-sm font-medium text-green-600">Opening Date</span>
                    </div>
                    <p className="font-semibold text-gray-900">
                      {format(new Date(contract.dateOfOpening), 'dd MMM yyyy')}
                    </p>
                  </div>
                </div>
                
                {/* Creator Information */}
                {contract.user && (
                  <div className="bg-gradient-to-br from-amber-50 to-orange-50 p-4 rounded-xl">
                    <div className="flex items-center gap-2 mb-2">
                      <User className="h-4 w-4 text-amber-600" />
                      <span className="text-sm font-medium text-amber-600">Created By</span>
                    </div>
                    <p className="font-semibold text-gray-900">{contract.user.name || contract.user.email}</p>
                  </div>
                )}
                
                {contract.loaNo && (
                  <div className="bg-gradient-to-br from-purple-50 to-violet-50 p-4 rounded-xl">
                    <div className="flex items-center gap-2 mb-2">
                      <FileText className="h-4 w-4 text-purple-600" />
                      <span className="text-sm font-medium text-purple-600">LOA Number</span>
                    </div>
                    <p className="font-semibold text-gray-900">{contract.loaNo}</p>
                  </div>
                )}
                
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center bg-blue-50 p-3 rounded-lg">
                    <p className="text-2xl font-bold text-blue-700">{contract._count.bills}</p>
                    <p className="text-xs text-blue-600">Bills</p>
                  </div>
                  <div className="text-center bg-green-50 p-3 rounded-lg">
                    <p className="text-2xl font-bold text-green-700">{contract._count.pvcCalculations}</p>
                    <p className="text-xs text-green-600">PVC Calcs</p>
                  </div>
                  <div className="text-center bg-orange-50 p-3 rounded-lg">
                    <p className="text-xs text-orange-600 font-medium">Base Month</p>
                    <p className="text-sm font-bold text-orange-700">
                      {format(new Date(contract.baseMonth), 'MMM yyyy')}
                    </p>
                  </div>
                </div>
                
                <div className="flex flex-wrap gap-2 pt-4 border-t border-gray-100">
                  <RecentBillsDialog contract={contract} />
                  
                  <Button asChild variant="outline" size="sm" className="hover:bg-blue-50">
                    <Link href={`/contracts/${contract.id}`}>
                      <Eye className="h-4 w-4 mr-1" />
                      View Details
                    </Link>
                  </Button>
                  
                  <Button asChild size="sm" className="bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white">
                    <Link href={`/bills/new?contractId=${contract.id}`}>
                      <Plus className="h-4 w-4 mr-1" />
                      Create Bill
                    </Link>
                  </Button>
                  
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        disabled={deleteLoading === contract.id}
                      >
                        {deleteLoading === contract.id ? (
                          <LoadingSpinner size="sm" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent className="max-w-md">
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete Contract</AlertDialogTitle>
                        <AlertDialogDescription className="text-sm">
                          Are you sure you want to delete contract "{contract.agreementNo}"? 
                          This action cannot be undone and will permanently delete all associated bills and PVC calculations.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter className="flex-col sm:flex-row gap-2">
                        <AlertDialogCancel className="w-full sm:w-auto">Cancel</AlertDialogCancel>
                        <AlertDialogAction 
                          onClick={() => handleDeleteContract(contract.id)}
                          className="bg-red-600 hover:bg-red-700 w-full sm:w-auto"
                        >
                          Delete Contract
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
                
                <div className="text-xs text-gray-500 border-t border-gray-100 pt-3">
                  Created: {format(toISTDate(new Date(contract.createdAt)), 'dd MMM yyyy')} • 
                  Updated: {format(toISTDate(new Date(contract.updatedAt)), 'dd MMM yyyy')}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        // Table View
        <Card className="border-0 shadow-lg overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-gradient-to-r from-blue-50 to-indigo-50">
                  <TableHead className="font-bold">Agreement No.</TableHead>
                  <TableHead className="font-bold">Contractor</TableHead>
                  <TableHead className="font-bold">Work Description</TableHead>
                  <TableHead className="font-bold">Opening Date</TableHead>
                  <TableHead className="font-bold">Created By</TableHead>
                  <TableHead className="font-bold text-center">Bills</TableHead>
                  <TableHead className="font-bold text-center">PVC</TableHead>
                  <TableHead className="font-bold">Status</TableHead>
                  <TableHead className="font-bold text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredContracts.map((contract) => (
                  <TableRow key={contract.id} className="hover:bg-blue-50/50 transition-colors">
                    <TableCell className="font-semibold text-blue-900">
                      {contract.agreementNo}
                    </TableCell>
                    <TableCell className="font-medium">
                      {contract.contractorName}
                    </TableCell>
                    <TableCell className="max-w-xs">
                      <div className="line-clamp-2 text-sm text-gray-600">
                        {contract.workDescription}
                      </div>
                    </TableCell>
                    <TableCell>
                      {format(new Date(contract.dateOfOpening), 'dd MMM yyyy')}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <User className="h-3.5 w-3.5 text-gray-500" />
                        <span className="text-sm text-gray-700">
                          {contract.user?.name || contract.user?.email || 'Unknown'}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className="bg-blue-50">
                        {contract._count.bills}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className="bg-green-50">
                        {contract._count.pvcCalculations}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {getStatusBadge(contract)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <RecentBillsDialog contract={contract} />
                        <Button asChild variant="outline" size="sm" className="hover:bg-blue-50">
                          <Link href={`/contracts/${contract.id}`}>
                            <Eye className="h-4 w-4" />
                          </Link>
                        </Button>
                        <Button asChild size="sm" className="bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white">
                          <Link href={`/bills/new?contractId=${contract.id}`}>
                            <Plus className="h-4 w-4" />
                          </Link>
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                              disabled={deleteLoading === contract.id}
                            >
                              {deleteLoading === contract.id ? (
                                <LoadingSpinner size="sm" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent className="max-w-md">
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete Contract</AlertDialogTitle>
                              <AlertDialogDescription className="text-sm">
                                Are you sure you want to delete contract "{contract.agreementNo}"? 
                                This action cannot be undone and will permanently delete all associated bills and PVC calculations.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter className="flex-col sm:flex-row gap-2">
                              <AlertDialogCancel className="w-full sm:w-auto">Cancel</AlertDialogCancel>
                              <AlertDialogAction 
                                onClick={() => handleDeleteContract(contract.id)}
                                className="bg-red-600 hover:bg-red-700 w-full sm:w-auto"
                              >
                                Delete Contract
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}
    </div>
  );
}
