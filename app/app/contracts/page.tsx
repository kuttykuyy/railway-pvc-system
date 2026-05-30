
'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { StatusMessage } from '@/components/ui/status-message';
import { PostingDetailsNotice } from '@/components/posting-details-notice';
import {
  Building2, Plus, Eye, FileText, Receipt, TrendingUp, Trash2,
  Search, IndianRupee, CheckCircle, AlertTriangle, LayoutGrid, LayoutList
} from 'lucide-react';
import Link from 'next/link';
import { format } from 'date-fns';
import { toISTDate } from '@/lib/ist-utils';

interface Contract {
  id: string;
  agreementNo: string;
  contractorName: string;
  workDescription: string;
  dateOfOpening: Date;
  baseMonth: Date;
  loaNo: string | null;
  loaDate: string | Date | null;
  user?: { name: string | null; email: string } | null;
  _count: { bills: number; pvcCalculations: number };
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
  pvcCalculation: { totalPvc: number; cumulativePvc: number } | null;
}

const fmtCurrency = (n: number) => {
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(2)} Cr`;
  if (n >= 100000) return `₹${(n / 100000).toFixed(2)} L`;
  return `₹${n.toLocaleString('en-IN')}`;
};

function StatusPill({ contract }: { contract: Contract }) {
  if (contract._count.pvcCalculations > 0)
    return <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium"><CheckCircle className="h-3 w-3" />PVC Done</span>;
  if (contract._count.bills > 0)
    return <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">Active</span>;
  return <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium">No Bills</span>;
}

function BillsDialog({ contract }: { contract: Contract }) {
  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch(`/api/bills?contractId=${contract.id}`)
      .then(r => r.json())
      .then(d => setBills((Array.isArray(d) ? d : d.data || []).slice(0, 10)))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="text-xs text-blue-600 hover:underline font-medium">
          {contract._count.bills} bill{contract._count.bills !== 1 ? 's' : ''}
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">
            Bills — {contract.agreementNo}
          </DialogTitle>
          <p className="text-sm text-gray-500">{contract.contractorName}</p>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-10"><LoadingSpinner text="Loading bills..." /></div>
        ) : error ? (
          <StatusMessage type="error" title="Error" message={error} />
        ) : bills.length === 0 ? (
          <div className="text-center py-10 text-gray-400">
            <FileText className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p>No bills yet.</p>
            <Button asChild size="sm" className="mt-4">
              <Link href={`/bills/new?contractId=${contract.id}`}><Plus className="h-4 w-4 mr-1" />Create First Bill</Link>
            </Button>
          </div>
        ) : (
          <>
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500">Bill No</th>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500">Quarter</th>
                    <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500">Bill Amount</th>
                    <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500">PVC</th>
                    <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500">Cumulative PVC</th>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500">Measurement Date</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {bills.map(bill => (
                    <tr key={bill.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2 font-semibold text-gray-800">{bill.billNo}</td>
                      <td className="px-3 py-2 text-gray-600">{bill.quarter}</td>
                      <td className="px-3 py-2 text-right font-medium">₹{bill.billAmount.toLocaleString('en-IN')}</td>
                      <td className="px-3 py-2 text-right">
                        {bill.pvcCalculation ? (
                          <span className={bill.pvcCalculation.totalPvc >= 0 ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold'}>
                            ₹{bill.pvcCalculation.totalPvc.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                          </span>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {bill.pvcCalculation ? (
                          <span className="text-gray-700 font-medium">
                            ₹{bill.pvcCalculation.cumulativePvc.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                          </span>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-3 py-2 text-gray-500 text-xs">{format(new Date(bill.dateOfMeasurement), 'dd MMM yyyy')}</td>
                      <td className="px-3 py-2">
                        <Link href={`/bills/${bill.id}`} className="text-blue-600 hover:text-blue-800">
                          <Eye className="h-4 w-4" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {contract._count.bills > 10 && (
              <div className="text-center pt-2">
                <Link href={`/contracts/${contract.id}`} className="text-sm text-blue-600 hover:underline">
                  View all {contract._count.bills} bills →
                </Link>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function DeleteButton({ contract, onDelete }: { contract: Contract; onDelete: (id: string) => void }) {
  const [loading, setLoading] = useState(false);
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <button className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors" disabled={loading}>
          {loading ? <LoadingSpinner size="sm" /> : <Trash2 className="h-4 w-4" />}
        </button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Contract</AlertDialogTitle>
          <AlertDialogDescription>
            Delete "{contract.agreementNo}"? All bills and PVC calculations will be permanently removed.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-red-600 hover:bg-red-700 text-white"
            onClick={async () => { setLoading(true); await onDelete(contract.id); setLoading(false); }}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default function ContractsPage() {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [filtered, setFiltered] = useState<Contract[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('newest');

  useEffect(() => {
    const saved = localStorage.getItem('contractsViewMode');
    if (saved === 'grid' || saved === 'table') setViewMode(saved);
    fetch('/api/contracts')
      .then(r => r.json())
      .then(setContracts)
      .catch(e => setError(e.message))
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    let f = [...contracts];
    if (search) {
      const q = search.toLowerCase();
      f = f.filter(c =>
        c.agreementNo.toLowerCase().includes(q) ||
        c.contractorName.toLowerCase().includes(q) ||
        c.workDescription.toLowerCase().includes(q)
      );
    }
    if (statusFilter !== 'all') {
      f = f.filter(c =>
        statusFilter === 'active' ? c._count.bills > 0 :
        statusFilter === 'inactive' ? c._count.bills === 0 :
        statusFilter === 'with-pvc' ? c._count.pvcCalculations > 0 : true
      );
    }
    f.sort((a, b) =>
      sortBy === 'newest' ? new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime() :
      sortBy === 'oldest' ? new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() :
      sortBy === 'name' ? a.agreementNo.localeCompare(b.agreementNo) :
      sortBy === 'contractor' ? a.contractorName.localeCompare(b.contractorName) :
      sortBy === 'bills' ? b._count.bills - a._count.bills : 0
    );
    setFiltered(f);
  }, [contracts, search, statusFilter, sortBy]);

  const handleDelete = async (id: string) => {
    await fetch(`/api/contracts/${id}`, { method: 'DELETE' });
    setContracts(cs => cs.filter(c => c.id !== id));
  };

  const stats = {
    total: contracts.length,
    active: contracts.filter(c => c._count.bills > 0).length,
    pvcEligible: contracts.filter(c => c.pvcApplicable).length,
    totalBills: contracts.reduce((s, c) => s + c._count.bills, 0),
    totalValue: contracts.reduce((s, c) => s + (c.contractValue || 0), 0),
  };

  if (isLoading) return <div className="flex justify-center py-16"><LoadingSpinner size="lg" text="Loading contracts..." /></div>;

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-5">
      <PostingDetailsNotice />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Contracts</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage railway contracts and PVC calculations</p>
        </div>
        <Button asChild className="bg-blue-600 hover:bg-blue-700 text-white">
          <Link href="/contracts/new"><Plus className="h-4 w-4 mr-1.5" />New Contract</Link>
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Contracts', value: stats.total, icon: Building2, color: 'text-gray-900' },
          { label: 'Portfolio Value', value: fmtCurrency(stats.totalValue), icon: IndianRupee, color: 'text-green-600' },
          { label: 'PVC Eligible', value: stats.pvcEligible, icon: TrendingUp, color: 'text-blue-600' },
          { label: 'Bills Processed', value: stats.totalBills, icon: Receipt, color: 'text-amber-600' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-white border border-gray-200 rounded-lg px-4 py-3 flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
              <p className={`text-2xl font-bold mt-0.5 ${color}`}>{value}</p>
            </div>
            <Icon className={`h-5 w-5 opacity-30 ${color}`} />
          </div>
        ))}
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input placeholder="Search agreement, contractor, work..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9 text-sm" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-9 text-sm w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="active">With Bills</SelectItem>
            <SelectItem value="inactive">No Bills</SelectItem>
            <SelectItem value="with-pvc">With PVC</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="h-9 text-sm w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest First</SelectItem>
            <SelectItem value="oldest">Oldest First</SelectItem>
            <SelectItem value="name">Agreement No.</SelectItem>
            <SelectItem value="contractor">Contractor</SelectItem>
            <SelectItem value="bills">Most Bills</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex border border-gray-200 rounded-lg overflow-hidden">
          <button onClick={() => { setViewMode('grid'); localStorage.setItem('contractsViewMode', 'grid'); }}
            className={`px-3 py-1.5 text-sm flex items-center gap-1 transition-colors ${viewMode === 'grid' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
            <LayoutGrid className="h-4 w-4" /> Grid
          </button>
          <button onClick={() => { setViewMode('table'); localStorage.setItem('contractsViewMode', 'table'); }}
            className={`px-3 py-1.5 text-sm flex items-center gap-1 transition-colors ${viewMode === 'table' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
            <LayoutList className="h-4 w-4" /> Table
          </button>
        </div>
      </div>

      {error && <StatusMessage type="error" title="Error" message={error} />}

      {/* Results count */}
      {filtered.length > 0 && (
        <p className="text-xs text-gray-400">{filtered.length} contract{filtered.length !== 1 ? 's' : ''}</p>
      )}

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className="text-center py-16 border border-dashed border-gray-200 rounded-lg">
          <Building2 className="h-10 w-10 text-gray-300 mx-auto mb-3" />
          <p className="font-medium text-gray-600">{contracts.length === 0 ? 'No contracts yet' : 'No results'}</p>
          <p className="text-sm text-gray-400 mt-1">
            {contracts.length === 0 ? 'Create your first contract to get started.' : 'Try a different search or filter.'}
          </p>
          {contracts.length === 0 ? (
            <Button asChild size="sm" className="mt-4 bg-blue-600 text-white hover:bg-blue-700">
              <Link href="/contracts/new"><Plus className="h-4 w-4 mr-1" />Create Contract</Link>
            </Button>
          ) : (
            <button onClick={() => { setSearch(''); setStatusFilter('all'); setSortBy('newest'); }} className="mt-4 text-sm text-blue-600 hover:underline">
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* Grid view */}
      {filtered.length > 0 && viewMode === 'grid' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filtered.map(c => (
            <div key={c.id} className={`bg-white border border-gray-200 rounded-lg overflow-hidden hover:shadow-sm transition-shadow border-l-4 ${
              c._count.pvcCalculations > 0 ? 'border-l-green-500' : c._count.bills > 0 ? 'border-l-blue-500' : 'border-l-gray-200'
            }`}>
              {/* Card header */}
              <div className="px-4 pt-4 pb-3 border-b border-gray-100">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-gray-900 text-base">{c.agreementNo}</span>
                      <StatusPill contract={c} />
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5 truncate">{c.workDescription}</p>
                  </div>
                  <DeleteButton contract={c} onDelete={handleDelete} />
                </div>
              </div>

              {/* Card body */}
              <div className="px-4 py-3 space-y-3">
                <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                  <div>
                    <span className="text-xs text-gray-400 block">Contractor</span>
                    <span className="font-medium text-gray-800 truncate block">{c.contractorName}</span>
                  </div>
                  <div>
                    <span className="text-xs text-gray-400 block">Contract Value</span>
                    <span className="font-semibold text-green-600">{c.contractValue ? fmtCurrency(c.contractValue) : '—'}</span>
                  </div>
                  <div>
                    <span className="text-xs text-gray-400 block">Opening Date</span>
                    <span className="text-gray-700">{format(new Date(c.dateOfOpening), 'dd MMM yyyy')}</span>
                  </div>
                  <div>
                    <span className="text-xs text-gray-400 block">Base Month</span>
                    <span className="text-gray-700">{format(new Date(c.baseMonth), 'MMM yyyy')}</span>
                  </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                  <div className="flex items-center gap-3 text-xs text-gray-500">
                    <BillsDialog contract={c} />
                    <span>· {c._count.pvcCalculations} PVC calcs</span>
                    {c.user && <span className="hidden sm:inline">· {c.user.name || c.user.email}</span>}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Link href={`/contracts/${c.id}`}
                      className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 border border-gray-200 rounded text-gray-600 hover:bg-gray-50">
                      <Eye className="h-3.5 w-3.5" /> View
                    </Link>
                    <Link href={`/bills/new?contractId=${c.id}`}
                      className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700">
                      <Plus className="h-3.5 w-3.5" /> Bill
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Table view */}
      {filtered.length > 0 && viewMode === 'table' && (
        <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Agreement No.</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Contractor</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">Value</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Opening</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Base Month</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500">Bills</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500">PVC</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Status</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map(c => (
                  <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-semibold text-gray-900">{c.agreementNo}</td>
                    <td className="px-4 py-3 text-gray-700 max-w-40 truncate">{c.contractorName}</td>
                    <td className="px-4 py-3 text-right font-semibold text-green-600">
                      {c.contractValue ? fmtCurrency(c.contractValue) : '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{format(new Date(c.dateOfOpening), 'dd MMM yyyy')}</td>
                    <td className="px-4 py-3 text-gray-600">{format(new Date(c.baseMonth), 'MMM yyyy')}</td>
                    <td className="px-4 py-3 text-center"><BillsDialog contract={c} /></td>
                    <td className="px-4 py-3 text-center text-gray-600">{c._count.pvcCalculations}</td>
                    <td className="px-4 py-3"><StatusPill contract={c} /></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Link href={`/contracts/${c.id}`}
                          className="p-1.5 rounded text-gray-500 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                          <Eye className="h-4 w-4" />
                        </Link>
                        <Link href={`/bills/new?contractId=${c.id}`}
                          className="p-1.5 rounded text-gray-500 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                          <Plus className="h-4 w-4" />
                        </Link>
                        <DeleteButton contract={c} onDelete={handleDelete} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
