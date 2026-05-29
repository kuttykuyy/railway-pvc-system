
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
  loaDate: string | Date | null;
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
  contractValue: number | null;
  tenderAdvertisedValue: number | null;
  pvcApplicable: boolean;
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

  const formatIndianCurrency = (num: number) => {
    if (num >= 10000000) { // 1 Crore = 10,000,000
      return `₹${(num / 10000000).toFixed(2)} Cr`;
    }
    if (num >= 100000) { // 1 Lakh = 100,000
      return `₹${(num / 100000).toFixed(2)} L`;
    }
    return `₹${num.toLocaleString('en-IN')}`;
  };

  const getStatusBadge = (contract: Contract) => {
    if (contract._count.pvcCalculations > 0) {
      return (
        <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200/50 hover:bg-emerald-50">
          <CheckCircle className="h-3.5 w-3.5 mr-1" />
          Active with PVC
        </Badge>
      );
    } else if (contract._count.bills > 0) {
      return (
        <Badge className="bg-blue-50 text-blue-700 border-blue-200/50 hover:bg-blue-50">
          <BarChart3 className="h-3.5 w-3.5 mr-1" />
          Active
        </Badge>
      );
    } else {
      return (
        <Badge variant="outline" className="bg-slate-50 text-slate-600 border-slate-200/80">
          <AlertTriangle className="h-3.5 w-3.5 mr-1 text-slate-500" />
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
    totalBills: contracts.reduce((sum, c) => sum + c._count.bills, 0),
    totalValue: contracts.reduce((sum, c) => sum + (c.contractValue || 0), 0),
    pvcEligible: contracts.filter(c => c.pvcApplicable).length
  };

  return (
    <div className="space-y-6 sm:space-y-8 px-4 sm:px-0">
      {/* Posting Details Notice for Railway Officials */}
      <PostingDetailsNotice />
      
      {/* Premium, Clean Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white border border-slate-100 p-6 rounded-2xl shadow-sm">
        <div className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-3">
            <div className="bg-blue-50 p-2 rounded-xl text-blue-600">
              <Building2 className="h-7 w-7" />
            </div>
            Contracts
          </h1>
          <p className="text-sm sm:text-base text-slate-500 max-w-2xl">
            Manage your railway contracts, track bills, and run automatic Price Variation Clause calculations.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button asChild className="bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow-md shadow-blue-500/10 rounded-xl w-full sm:w-auto" size="lg">
            <Link href="/contracts/new">
              <Plus className="h-5 w-5 mr-2" />
              New Contract
            </Link>
          </Button>
        </div>
      </div>

      {/* Simplified, High-Contrast Statistics Dashboard */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <Card className="border border-slate-100 shadow-sm bg-white hover:shadow-md transition-all duration-200 rounded-2xl overflow-hidden">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Contracts</p>
                <p className="text-3xl font-bold text-slate-900">{stats.total}</p>
                <p className="text-xs text-slate-500">All registered contracts</p>
              </div>
              <div className="bg-blue-50 p-3 rounded-2xl text-blue-600">
                <Building2 className="h-6 w-6" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-slate-100 shadow-sm bg-white hover:shadow-md transition-all duration-200 rounded-2xl overflow-hidden">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Portfolio Value</p>
                <p className="text-3xl font-bold text-emerald-600">{formatIndianCurrency(stats.totalValue)}</p>
                <p className="text-xs text-slate-500">Combined value of works</p>
              </div>
              <div className="bg-emerald-50 p-3 rounded-2xl text-emerald-600">
                <IndianRupee className="h-6 w-6" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-slate-100 shadow-sm bg-white hover:shadow-md transition-all duration-200 rounded-2xl overflow-hidden">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">PVC Eligible</p>
                <p className="text-3xl font-bold text-violet-600">{stats.pvcEligible}</p>
                <p className="text-xs text-slate-500">Contracts under GCC 46A</p>
              </div>
              <div className="bg-violet-50 p-3 rounded-2xl text-violet-600">
                <TrendingUp className="h-6 w-6" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-slate-100 shadow-sm bg-white hover:shadow-md transition-all duration-200 rounded-2xl overflow-hidden">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Bills Processed</p>
                <p className="text-3xl font-bold text-amber-600">{stats.totalBills}</p>
                <p className="text-xs text-slate-500">Across all active contracts</p>
              </div>
              <div className="bg-amber-50 p-3 rounded-2xl text-amber-600">
                <Receipt className="h-6 w-6" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters and Search - Clean Layout */}
      <Card className="border border-slate-100 shadow-sm bg-white rounded-2xl">
        <CardHeader className="p-5 sm:p-6 pb-2">
          <CardTitle className="flex items-center gap-2 text-lg font-bold text-slate-900">
            <Filter className="h-5 w-5 text-slate-500" />
            Search & Filter
          </CardTitle>
          <CardDescription className="text-sm">
            Quickly locate contracts and switch view modes
          </CardDescription>
        </CardHeader>
        <CardContent className="p-5 sm:p-6 pt-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <div className="space-y-1.5 col-span-1 sm:col-span-2">
              <label className="text-xs font-semibold text-slate-500 uppercase">Search Contracts</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  placeholder="Agreement No, contractor, work..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 h-11 border-slate-200 rounded-xl"
                />
              </div>
            </div>
            
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-500 uppercase">Status</label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-11 border-slate-200 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="active">Active (with bills)</SelectItem>
                  <SelectItem value="inactive">No Bills</SelectItem>
                  <SelectItem value="with-pvc">With PVC Calculations</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-500 uppercase">Sort By</label>
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="h-11 border-slate-200 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Newest Created</SelectItem>
                  <SelectItem value="oldest">Oldest Created</SelectItem>
                  <SelectItem value="name">Agreement Number</SelectItem>
                  <SelectItem value="contractor">Contractor Name</SelectItem>
                  <SelectItem value="bills">Most Bills First</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-500 uppercase">View Mode</label>
              <div className="flex gap-2 h-11 bg-slate-50 p-1 rounded-xl">
                <button
                  onClick={() => handleViewModeChange('grid')}
                  className={`flex-grow flex items-center justify-center gap-1 rounded-lg text-xs font-bold transition-all ${viewMode === 'grid' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                >
                  <LayoutGrid className="h-3.5 w-3.5" />
                  Grid
                </button>
                <button
                  onClick={() => handleViewModeChange('table')}
                  className={`flex-grow flex items-center justify-center gap-1 rounded-lg text-xs font-bold transition-all ${viewMode === 'table' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                >
                  <LayoutList className="h-3.5 w-3.5" />
                  Table
                </button>
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
        <Card className="border border-slate-100 shadow-sm bg-white rounded-2xl">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Building2 className="h-16 w-16 text-slate-300 mb-6" />
            <h3 className="text-xl font-bold text-slate-900 mb-2">
              {contracts.length === 0 ? 'No contracts yet' : 'No contracts match your filters'}
            </h3>
            <p className="text-slate-500 text-center mb-8 max-w-sm">
              {contracts.length === 0 
                ? 'Get started by adding your first railway contract to begin PVC calculations.'
                : 'Try adjusting your search terms or filters to find the contracts you\'re looking for.'
              }
            </p>
            {contracts.length === 0 ? (
              <Button asChild size="lg" className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl">
                <Link href="/contracts/new">
                  <Plus className="h-5 w-5 mr-2" />
                  Create First Contract
                </Link>
              </Button>
            ) : (
              <Button variant="outline" className="rounded-xl" onClick={() => {
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
          {filteredContracts.map((contract) => {
            const hasPvc = contract._count.pvcCalculations > 0;
            const hasBills = contract._count.bills > 0;
            let cardBorder = "border-l-4 border-l-slate-200 border-y border-r border-slate-100 bg-white";
            if (hasPvc) {
              cardBorder = "border-l-4 border-l-emerald-500 border-y border-r border-slate-100 bg-white";
            } else if (hasBills) {
              cardBorder = "border-l-4 border-l-blue-500 border-y border-r border-slate-100 bg-white";
            }
            
            return (
              <Card key={contract.id} className={`${cardBorder} shadow-sm hover:shadow-md transition-all duration-200 rounded-2xl overflow-hidden`}>
                <CardHeader className="pb-3 p-6">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <h3 className="text-xl font-bold text-slate-900 tracking-tight">
                          {contract.agreementNo}
                        </h3>
                        {getStatusBadge(contract)}
                      </div>
                      <p className="text-xs text-slate-400">
                        LOA: {contract.loaNo || 'Not Specified'} {contract.loaDate ? `(${format(new Date(contract.loaDate), 'dd MMM yyyy')})` : ''}
                      </p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="px-6 pb-6 space-y-5">
                  <p className="text-sm text-slate-600 line-clamp-2 leading-relaxed">
                    {contract.workDescription}
                  </p>

                  <div className="grid grid-cols-2 gap-4 bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Contractor</span>
                      <span className="text-sm font-semibold text-slate-800 line-clamp-1">{contract.contractorName}</span>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Contract Value</span>
                      <span className="text-sm font-bold text-emerald-600 block">
                        {contract.contractValue ? formatIndianCurrency(contract.contractValue) : 'Not Specified'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Opening Date</span>
                      <span className="text-sm font-semibold text-slate-800 block">
                        {format(new Date(contract.dateOfOpening), 'dd MMM yyyy')}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Base Month</span>
                      <span className="text-sm font-semibold text-slate-800 block">
                        {format(new Date(contract.baseMonth), 'MMM yyyy')}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between py-2 border-t border-slate-100 text-xs text-slate-400">
                    <span className="font-medium">
                      Processed: <strong className="text-slate-700">{contract._count.bills} bills</strong> • PVC: <strong className="text-slate-700">{contract._count.pvcCalculations} calcs</strong>
                    </span>
                    {contract.user && (
                      <span className="italic">
                        By: {contract.user.name || contract.user.email}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-3 pt-2">
                    <div className="flex gap-2">
                      <RecentBillsDialog contract={contract} />
                      <Button asChild variant="outline" size="sm" className="rounded-xl border-slate-200 text-slate-600 hover:bg-slate-50">
                        <Link href={`/contracts/${contract.id}`}>
                          <Eye className="h-4 w-4 mr-1.5" />
                          Details
                        </Link>
                      </Button>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button asChild size="sm" className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold shadow-sm">
                        <Link href={`/bills/new?contractId=${contract.id}`}>
                          <Plus className="h-4 w-4 mr-1.5" />
                          Create Bill
                        </Link>
                      </Button>

                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="text-red-500 hover:text-red-600 hover:bg-red-50/50 border-slate-200 rounded-xl"
                            disabled={deleteLoading === contract.id}
                          >
                            {deleteLoading === contract.id ? (
                              <LoadingSpinner size="sm" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className="max-w-md rounded-2xl border-slate-100">
                          <AlertDialogHeader>
                            <AlertDialogTitle className="text-xl font-bold">Delete Contract</AlertDialogTitle>
                            <AlertDialogDescription className="text-sm text-slate-500">
                              Are you sure you want to delete contract "{contract.agreementNo}"? 
                              This will permanently delete all associated bills and PVC calculations. This action is irreversible.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter className="flex-col sm:flex-row gap-2 pt-4">
                            <AlertDialogCancel className="w-full sm:w-auto rounded-xl">Cancel</AlertDialogCancel>
                            <AlertDialogAction 
                              onClick={() => handleDeleteContract(contract.id)}
                              className="bg-red-600 hover:bg-red-700 text-white w-full sm:w-auto rounded-xl"
                            >
                              Delete Contract
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        // Table View
        <Card className="border border-slate-100 shadow-sm bg-white rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50 border-b border-slate-100">
                  <TableHead className="font-bold text-slate-800 h-12">Agreement No.</TableHead>
                  <TableHead className="font-bold text-slate-800 h-12">Contractor</TableHead>
                  <TableHead className="font-bold text-slate-800 h-12">Contract Value</TableHead>
                  <TableHead className="font-bold text-slate-800 h-12">Opening Date</TableHead>
                  <TableHead className="font-bold text-slate-800 h-12">Base Month</TableHead>
                  <TableHead className="font-bold text-slate-800 text-center h-12">Bills</TableHead>
                  <TableHead className="font-bold text-slate-800 text-center h-12">PVC</TableHead>
                  <TableHead className="font-bold text-slate-800 h-12">Status</TableHead>
                  <TableHead className="font-bold text-slate-800 text-right h-12 pr-6">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredContracts.map((contract) => (
                  <TableRow key={contract.id} className="hover:bg-slate-50/50 transition-colors border-b border-slate-100">
                    <TableCell className="font-bold text-slate-900 pl-6">
                      {contract.agreementNo}
                    </TableCell>
                    <TableCell className="font-semibold text-slate-700">
                      {contract.contractorName}
                    </TableCell>
                    <TableCell className="font-bold text-emerald-600">
                      {contract.contractValue ? formatIndianCurrency(contract.contractValue) : 'Not Specified'}
                    </TableCell>
                    <TableCell className="text-slate-600 text-sm">
                      {format(new Date(contract.dateOfOpening), 'dd MMM yyyy')}
                    </TableCell>
                    <TableCell className="text-slate-600 text-sm">
                      {format(new Date(contract.baseMonth), 'MMM yyyy')}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className="bg-slate-50 text-slate-700 border-slate-200">
                        {contract._count.bills}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className="bg-slate-50 text-slate-700 border-slate-200">
                        {contract._count.pvcCalculations}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {getStatusBadge(contract)}
                    </TableCell>
                    <TableCell className="text-right pr-6">
                      <div className="flex justify-end gap-2">
                        <RecentBillsDialog contract={contract} />
                        <Button asChild variant="outline" size="sm" className="rounded-xl border-slate-200 text-slate-600 hover:bg-slate-50">
                          <Link href={`/contracts/${contract.id}`}>
                            <Eye className="h-4 w-4" />
                          </Link>
                        </Button>
                        <Button asChild size="sm" className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl">
                          <Link href={`/bills/new?contractId=${contract.id}`}>
                            <Plus className="h-4 w-4" />
                          </Link>
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="text-red-500 hover:text-red-600 hover:bg-red-50/50 border-slate-200 rounded-xl"
                              disabled={deleteLoading === contract.id}
                            >
                              {deleteLoading === contract.id ? (
                                <LoadingSpinner size="sm" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent className="max-w-md rounded-2xl border-slate-100">
                            <AlertDialogHeader>
                              <AlertDialogTitle className="text-xl font-bold">Delete Contract</AlertDialogTitle>
                              <AlertDialogDescription className="text-sm text-slate-500">
                                Are you sure you want to delete contract "{contract.agreementNo}"? 
                                This will permanently delete all associated bills and PVC calculations. This action is irreversible.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter className="flex-col sm:flex-row gap-2 pt-4">
                              <AlertDialogCancel className="w-full sm:w-auto rounded-xl">Cancel</AlertDialogCancel>
                              <AlertDialogAction 
                                onClick={() => handleDeleteContract(contract.id)}
                                className="bg-red-600 hover:bg-red-700 text-white w-full sm:w-auto rounded-xl"
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
