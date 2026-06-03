'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import {
  AlertTriangle,
  ArrowUpRight,
  Building2,
  CalendarDays,
  CheckCircle,
  ClipboardList,
  Edit,
  Eye,
  FileText,
  Filter,
  IndianRupee,
  LayoutGrid,
  LayoutList,
  Plus,
  Receipt,
  Search,
  Trash2,
  TrendingUp,
  X,
} from 'lucide-react';

import { PostingDetailsNotice } from '@/components/posting-details-notice';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { StatusMessage } from '@/components/ui/status-message';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface Contract {
  id: string;
  agreementNo: string;
  contractorName: string;
  workDescription: string;
  dateOfOpening: string | Date;
  baseMonth: string | Date;
  loaNo: string | null;
  loaDate: string | Date | null;
  user?: { name: string | null; email: string } | null;
  _count: { bills: number; pvcCalculations: number };
  createdAt: string | Date;
  updatedAt: string | Date;
  contractValue: number | null;
  tenderAdvertisedValue: number | null;
  pvcApplicable: boolean;
}

interface Bill {
  id: string;
  billNo: string;
  billAmount: number;
  dateOfMeasurement: string | Date;
  quarter: string;
  createdAt: string | Date;
  pvcCalculation: { totalPvc: number; cumulativePvc: number } | null;
}

const toNumber = (value: number | null | undefined) => Number(value || 0);

const fmtCurrency = (value: number | null | undefined) => {
  const n = toNumber(value);
  if (!n) return 'Not set';
  if (n >= 10000000) return `Rs ${(n / 10000000).toFixed(2)} Cr`;
  if (n >= 100000) return `Rs ${(n / 100000).toFixed(2)} L`;
  return `Rs ${n.toLocaleString('en-IN')}`;
};

const dateLabel = (value: string | Date | null | undefined, pattern = 'dd MMM yyyy') => {
  if (!value) return 'Not set';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not set';
  return format(date, pattern);
};

function contractAttentionReasons(contract: Contract) {
  const reasons: string[] = [];

  if (contract._count.bills === 0) reasons.push('No bills created');
  if (contract.pvcApplicable && contract._count.bills > 0 && contract._count.pvcCalculations === 0) {
    reasons.push('PVC pending');
  }
  if (!contract.contractValue && !contract.tenderAdvertisedValue) reasons.push('Value missing');
  if (!contract.loaNo) reasons.push('LOA missing');

  return reasons;
}

function StatusPill({ contract }: { contract: Contract }) {
  const reasons = contractAttentionReasons(contract);

  if (contract._count.pvcCalculations > 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
        <CheckCircle className="h-3.5 w-3.5" />
        PVC ready
      </span>
    );
  }

  if (reasons.includes('PVC pending')) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">
        <AlertTriangle className="h-3.5 w-3.5" />
        PVC pending
      </span>
    );
  }

  if (contract._count.bills > 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-1 text-xs font-semibold text-sky-700">
        <Receipt className="h-3.5 w-3.5" />
        Billing active
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">
      <FileText className="h-3.5 w-3.5" />
      Setup
    </span>
  );
}

function BillsDialog({ contract }: { contract: Contract }) {
  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;

    setError('');
    setLoading(true);
    fetch(`/api/bills?contractId=${contract.id}`)
      .then((response) => response.json())
      .then((data) => setBills((Array.isArray(data) ? data : data.data || []).slice(0, 10)))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [contract.id, open]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-semibold text-sky-700 hover:bg-sky-50">
          <Receipt className="h-3.5 w-3.5" />
          {contract._count.bills} bill{contract._count.bills !== 1 ? 's' : ''}
        </button>
      </DialogTrigger>
      <DialogContent className="max-h-[82vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">Bills for {contract.agreementNo}</DialogTitle>
          <p className="text-sm text-slate-500">{contract.contractorName}</p>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-10">
            <LoadingSpinner text="Loading bills..." />
          </div>
        ) : error ? (
          <StatusMessage type="error" title="Error" message={error} />
        ) : bills.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <FileText className="mb-3 h-10 w-10 text-slate-300" />
            <p className="font-medium text-slate-700">No bills have been created for this contract.</p>
            <Button asChild size="sm" className="mt-4">
              <Link href={`/bills/new?contractId=${contract.id}`}>
                <Plus className="mr-1.5 h-4 w-4" />
                Create first bill
              </Link>
            </Button>
          </div>
        ) : (
          <>
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-200 bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500">Bill no</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500">Quarter</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-slate-500">Bill amount</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-slate-500">PVC</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-slate-500">Cumulative</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500">Measured</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-slate-500">Open</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {bills.map((bill) => (
                    <tr key={bill.id} className="hover:bg-slate-50">
                      <td className="px-3 py-2 font-semibold text-slate-900">{bill.billNo}</td>
                      <td className="px-3 py-2 text-slate-600">{bill.quarter}</td>
                      <td className="px-3 py-2 text-right font-medium">{fmtCurrency(bill.billAmount)}</td>
                      <td className="px-3 py-2 text-right">
                        {bill.pvcCalculation ? (
                          <span className={bill.pvcCalculation.totalPvc >= 0 ? 'font-semibold text-emerald-700' : 'font-semibold text-red-600'}>
                            {fmtCurrency(bill.pvcCalculation.totalPvc)}
                          </span>
                        ) : (
                          <span className="text-slate-400">Pending</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right text-slate-700">
                        {bill.pvcCalculation ? fmtCurrency(bill.pvcCalculation.cumulativePvc) : '-'}
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-500">{dateLabel(bill.dateOfMeasurement)}</td>
                      <td className="px-3 py-2 text-right">
                        <Link href={`/bills/${bill.id}`} className="inline-flex rounded-md p-1.5 text-slate-500 hover:bg-sky-50 hover:text-sky-700">
                          <Eye className="h-4 w-4" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {contract._count.bills > 10 && (
              <div className="pt-2 text-center">
                <Link href={`/contracts/${contract.id}`} className="text-sm font-medium text-sky-700 hover:underline">
                  View all {contract._count.bills} bills
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
        <button
          aria-label={`Delete ${contract.agreementNo}`}
          className="rounded-md p-2 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
          disabled={loading}
        >
          {loading ? <LoadingSpinner size="sm" /> : <Trash2 className="h-4 w-4" />}
        </button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete contract?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently delete {contract.agreementNo}, including all bills and PVC calculations linked to it.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-red-600 text-white hover:bg-red-700"
            onClick={async () => {
              setLoading(true);
              await onDelete(contract.id);
              setLoading(false);
            }}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function MetricCard({
  label,
  value,
  helper,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string | number;
  helper: string;
  icon: typeof Building2;
  tone: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase text-slate-500">{label}</p>
          <p className="mt-1 truncate text-2xl font-bold text-slate-950">{value}</p>
          <p className="mt-1 text-xs text-slate-500">{helper}</p>
        </div>
        <div className={`rounded-md p-2 ${tone}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

export default function ContractsPage() {
  const [contracts, setContracts] = useState<Contract[]>([]);
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
      .then((response) => {
        if (!response.ok) throw new Error('Failed to fetch contracts');
        return response.json();
      })
      .then(setContracts)
      .catch((err) => setError(err.message))
      .finally(() => setIsLoading(false));
  }, []);

  const filtered = useMemo(() => {
    let list = [...contracts];

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((contract) =>
        [
          contract.agreementNo,
          contract.contractorName,
          contract.workDescription,
          contract.loaNo || '',
          contract.user?.name || '',
          contract.user?.email || '',
        ].some((value) => value.toLowerCase().includes(q))
      );
    }

    if (statusFilter !== 'all') {
      list = list.filter((contract) => {
        const attention = contractAttentionReasons(contract).length > 0;
        if (statusFilter === 'needs-action') return attention;
        if (statusFilter === 'active') return contract._count.bills > 0;
        if (statusFilter === 'no-bills') return contract._count.bills === 0;
        if (statusFilter === 'with-pvc') return contract._count.pvcCalculations > 0;
        if (statusFilter === 'not-eligible') return !contract.pvcApplicable;
        return true;
      });
    }

    list.sort((a, b) => {
      if (sortBy === 'oldest') return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      if (sortBy === 'agreement') return a.agreementNo.localeCompare(b.agreementNo);
      if (sortBy === 'contractor') return a.contractorName.localeCompare(b.contractorName);
      if (sortBy === 'bills') return b._count.bills - a._count.bills;
      if (sortBy === 'value') return toNumber(b.contractValue || b.tenderAdvertisedValue) - toNumber(a.contractValue || a.tenderAdvertisedValue);
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    return list;
  }, [contracts, search, sortBy, statusFilter]);

  const stats = useMemo(() => {
    const active = contracts.filter((contract) => contract._count.bills > 0).length;
    const pvcDone = contracts.filter((contract) => contract._count.pvcCalculations > 0).length;
    const needsAction = contracts.filter((contract) => contractAttentionReasons(contract).length > 0).length;
    const totalBills = contracts.reduce((sum, contract) => sum + contract._count.bills, 0);
    const totalValue = contracts.reduce((sum, contract) => sum + toNumber(contract.contractValue || contract.tenderAdvertisedValue), 0);

    return {
      active,
      needsAction,
      pvcDone,
      totalBills,
      totalValue,
      total: contracts.length,
    };
  }, [contracts]);

  const attentionContracts = useMemo(
    () => contracts.filter((contract) => contractAttentionReasons(contract).length > 0).slice(0, 4),
    [contracts]
  );

  const handleDelete = async (id: string) => {
    const response = await fetch(`/api/contracts/${id}`, { method: 'DELETE' });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setError(data.error || 'Failed to delete contract');
      return;
    }
    setContracts((current) => current.filter((contract) => contract.id !== id));
  };

  const resetFilters = () => {
    setSearch('');
    setStatusFilter('all');
    setSortBy('newest');
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[420px] items-center justify-center">
        <LoadingSpinner size="lg" text="Loading contracts..." />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <PostingDetailsNotice />

      <div className="mt-4 flex flex-col gap-4 border-b border-slate-200 pb-5 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-sky-700">
            <ClipboardList className="h-4 w-4" />
            Contract workspace
          </div>
          <h1 className="mt-1 text-2xl font-bold text-slate-950">Contracts</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Track agreements, bills, base months, and PVC readiness from one operational view.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/contracts/loa-analyzer">
              <FileText className="mr-2 h-4 w-4" />
              LOA analyzer
            </Link>
          </Button>
          <Button asChild>
            <Link href="/contracts/new">
              <Plus className="mr-2 h-4 w-4" />
              New contract
            </Link>
          </Button>
        </div>
      </div>

      {error && <div className="mt-4"><StatusMessage type="error" title="Error" message={error} /></div>}

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Contracts" value={stats.total} helper={`${stats.active} with billing activity`} icon={Building2} tone="bg-slate-100 text-slate-700" />
        <MetricCard label="Portfolio value" value={fmtCurrency(stats.totalValue)} helper="Agreement or tender value" icon={IndianRupee} tone="bg-emerald-50 text-emerald-700" />
        <MetricCard label="Bills" value={stats.totalBills} helper="Across visible contracts" icon={Receipt} tone="bg-sky-50 text-sky-700" />
        <MetricCard label="PVC ready" value={stats.pvcDone} helper="Contracts with PVC calculations" icon={TrendingUp} tone="bg-violet-50 text-violet-700" />
        <MetricCard label="Needs action" value={stats.needsAction} helper="Missing bills, LOA, value, or PVC" icon={AlertTriangle} tone="bg-amber-50 text-amber-700" />
      </div>

      {attentionContracts.length > 0 && (
        <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50/70 px-4 py-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-amber-800">
                <AlertTriangle className="h-4 w-4" />
                Priority follow-up
              </div>
              <p className="mt-1 text-sm text-amber-700">
                These contracts are missing data or the next billing/PVC step.
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:min-w-[620px]">
              {attentionContracts.map((contract) => (
                <Link
                  key={contract.id}
                  href={`/contracts/${contract.id}`}
                  className="flex items-center justify-between gap-3 rounded-md border border-amber-200 bg-white px-3 py-2 text-sm hover:border-amber-300 hover:bg-amber-50"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-900">{contract.agreementNo}</p>
                    <p className="truncate text-xs text-slate-500">{contractAttentionReasons(contract).join(', ')}</p>
                  </div>
                  <ArrowUpRight className="h-4 w-4 shrink-0 text-amber-700" />
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="mt-5 rounded-lg border border-slate-200 bg-white p-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Search agreement, contractor, work, LOA, or owner"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="h-10 pl-9"
            />
          </div>

          <div className="grid grid-cols-2 gap-2 sm:flex">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-10 w-full sm:w-44">
                <Filter className="mr-2 h-4 w-4 text-slate-400" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All contracts</SelectItem>
                <SelectItem value="needs-action">Needs action</SelectItem>
                <SelectItem value="active">With bills</SelectItem>
                <SelectItem value="no-bills">No bills</SelectItem>
                <SelectItem value="with-pvc">PVC ready</SelectItem>
                <SelectItem value="not-eligible">PVC not eligible</SelectItem>
              </SelectContent>
            </Select>

            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="h-10 w-full sm:w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest first</SelectItem>
                <SelectItem value="oldest">Oldest first</SelectItem>
                <SelectItem value="agreement">Agreement no</SelectItem>
                <SelectItem value="contractor">Contractor</SelectItem>
                <SelectItem value="bills">Most bills</SelectItem>
                <SelectItem value="value">Highest value</SelectItem>
              </SelectContent>
            </Select>

            <div className="flex overflow-hidden rounded-md border border-slate-200">
              <button
                aria-label="Grid view"
                onClick={() => {
                  setViewMode('grid');
                  localStorage.setItem('contractsViewMode', 'grid');
                }}
                className={`grid h-10 w-10 place-items-center ${viewMode === 'grid' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button
                aria-label="Table view"
                onClick={() => {
                  setViewMode('table');
                  localStorage.setItem('contractsViewMode', 'table');
                }}
                className={`grid h-10 w-10 place-items-center border-l border-slate-200 ${viewMode === 'table' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
              >
                <LayoutList className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-500">
          <span>
            Showing <strong className="text-slate-900">{filtered.length}</strong> of {contracts.length} contracts
          </span>
          {(search || statusFilter !== 'all' || sortBy !== 'newest') && (
            <button onClick={resetFilters} className="inline-flex items-center gap-1 rounded-md px-2 py-1 font-medium text-sky-700 hover:bg-sky-50">
              <X className="h-4 w-4" />
              Clear filters
            </button>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="mt-5 flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white py-16 text-center">
          <Building2 className="mb-3 h-10 w-10 text-slate-300" />
          <p className="font-semibold text-slate-800">{contracts.length === 0 ? 'No contracts yet' : 'No matching contracts'}</p>
          <p className="mt-1 max-w-md text-sm text-slate-500">
            {contracts.length === 0
              ? 'Create the first contract to start tracking bills, base months, and PVC calculations.'
              : 'Try changing the search text or status filter.'}
          </p>
          {contracts.length === 0 ? (
            <Button asChild size="sm" className="mt-4">
              <Link href="/contracts/new">
                <Plus className="mr-1.5 h-4 w-4" />
                Create contract
              </Link>
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={resetFilters} className="mt-4">
              Clear filters
            </Button>
          )}
        </div>
      ) : viewMode === 'grid' ? (
        <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-2">
          {filtered.map((contract) => {
            const reasons = contractAttentionReasons(contract);
            const mainValue = contract.contractValue || contract.tenderAdvertisedValue;

            return (
              <div key={contract.id} className="rounded-lg border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md">
                <div className="border-b border-slate-100 px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={`/contracts/${contract.id}`} className="truncate text-base font-bold text-slate-950 hover:text-sky-700">
                          {contract.agreementNo}
                        </Link>
                        <StatusPill contract={contract} />
                      </div>
                      <p className="mt-1 line-clamp-2 text-sm text-slate-500">{contract.workDescription}</p>
                    </div>
                    <DeleteButton contract={contract} onDelete={handleDelete} />
                  </div>
                </div>

                <div className="px-4 py-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <p className="text-xs font-semibold uppercase text-slate-400">Contractor</p>
                      <p className="mt-1 truncate font-semibold text-slate-900">{contract.contractorName}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase text-slate-400">Value</p>
                      <p className="mt-1 font-semibold text-emerald-700">{fmtCurrency(mainValue)}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase text-slate-400">Opening</p>
                      <p className="mt-1 flex items-center gap-1.5 text-slate-700">
                        <CalendarDays className="h-4 w-4 text-slate-400" />
                        {dateLabel(contract.dateOfOpening)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase text-slate-400">Base month</p>
                      <p className="mt-1 text-slate-700">{dateLabel(contract.baseMonth, 'MMM yyyy')}</p>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <BillsDialog contract={contract} />
                    <span className="inline-flex items-center gap-1 rounded-md bg-violet-50 px-2 py-1 text-xs font-semibold text-violet-700">
                      <TrendingUp className="h-3.5 w-3.5" />
                      {contract._count.pvcCalculations} PVC
                    </span>
                    <span className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold ${contract.pvcApplicable ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                      {contract.pvcApplicable ? 'Eligible' : 'Not eligible'}
                    </span>
                  </div>

                  {reasons.length > 0 && (
                    <div className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      <span className="font-semibold">Needs:</span> {reasons.join(', ')}
                    </div>
                  )}

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
                    <p className="truncate text-xs text-slate-500">
                      {contract.user ? `Owner: ${contract.user.name || contract.user.email}` : 'Owner not assigned'}
                    </p>
                    <div className="flex items-center gap-1">
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/contracts/${contract.id}`}>
                          <Eye className="mr-1.5 h-4 w-4" />
                          View
                        </Link>
                      </Button>
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/contracts/${contract.id}/edit`}>
                          <Edit className="mr-1.5 h-4 w-4" />
                          Edit
                        </Link>
                      </Button>
                      <Button asChild size="sm">
                        <Link href={`/bills/new?contractId=${contract.id}`}>
                          <Plus className="mr-1.5 h-4 w-4" />
                          Bill
                        </Link>
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mt-5 overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1020px] text-sm">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">Agreement</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">Contractor</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-slate-500">Value</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">Dates</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase text-slate-500">Bills</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase text-slate-500">PVC</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-slate-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((contract) => {
                  const reasons = contractAttentionReasons(contract);
                  return (
                    <tr key={contract.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <Link href={`/contracts/${contract.id}`} className="font-bold text-slate-950 hover:text-sky-700">
                          {contract.agreementNo}
                        </Link>
                        <p className="mt-1 max-w-xs truncate text-xs text-slate-500">{contract.workDescription}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="max-w-[180px] truncate font-medium text-slate-800">{contract.contractorName}</p>
                        <p className="text-xs text-slate-500">{contract.loaNo || 'LOA not set'}</p>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-emerald-700">
                        {fmtCurrency(contract.contractValue || contract.tenderAdvertisedValue)}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        <p>{dateLabel(contract.dateOfOpening)}</p>
                        <p className="text-xs text-slate-500">Base {dateLabel(contract.baseMonth, 'MMM yyyy')}</p>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <BillsDialog contract={contract} />
                      </td>
                      <td className="px-4 py-3 text-center font-semibold text-slate-700">{contract._count.pvcCalculations}</td>
                      <td className="px-4 py-3">
                        <div className="space-y-1">
                          <StatusPill contract={contract} />
                          {reasons.length > 0 && <p className="text-xs text-amber-700">{reasons[0]}</p>}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Link href={`/contracts/${contract.id}`} className="rounded-md p-2 text-slate-500 hover:bg-sky-50 hover:text-sky-700" aria-label="View contract">
                            <Eye className="h-4 w-4" />
                          </Link>
                          <Link href={`/contracts/${contract.id}/edit`} className="rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900" aria-label="Edit contract">
                            <Edit className="h-4 w-4" />
                          </Link>
                          <Link href={`/bills/new?contractId=${contract.id}`} className="rounded-md p-2 text-slate-500 hover:bg-emerald-50 hover:text-emerald-700" aria-label="Create bill">
                            <Plus className="h-4 w-4" />
                          </Link>
                          <DeleteButton contract={contract} onDelete={handleDelete} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
