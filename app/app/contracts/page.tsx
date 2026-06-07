'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Edit2,
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
  Zap,
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
  if (!n) return '—';
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(2)} Cr`;
  if (n >= 100000) return `₹${(n / 100000).toFixed(2)} L`;
  return `₹${n.toLocaleString('en-IN')}`;
};

const fmtCurrencyFull = (value: number | null | undefined) => {
  const n = toNumber(value);
  if (!n) return 'Not set';
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(2)} Cr`;
  if (n >= 100000) return `₹${(n / 100000).toFixed(2)} L`;
  return `₹${n.toLocaleString('en-IN')}`;
};

const dateLabel = (value: string | Date | null | undefined, pattern = 'dd MMM yyyy') => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return format(date, pattern);
};

function contractAttentionReasons(contract: Contract) {
  const reasons: string[] = [];
  if (contract._count.bills === 0) reasons.push('No bills');
  if (contract.pvcApplicable && contract._count.bills > 0 && contract._count.pvcCalculations === 0)
    reasons.push('PVC pending');
  if (!contract.contractValue && !contract.tenderAdvertisedValue) reasons.push('Value missing');
  if (!contract.loaNo) reasons.push('LOA missing');
  return reasons;
}

type StatusType = 'pvc-ready' | 'pvc-pending' | 'active' | 'setup';

function getContractStatus(contract: Contract): StatusType {
  if (contract._count.pvcCalculations > 0) return 'pvc-ready';
  if (contract.pvcApplicable && contract._count.bills > 0 && contract._count.pvcCalculations === 0) return 'pvc-pending';
  if (contract._count.bills > 0) return 'active';
  return 'setup';
}

const STATUS_CONFIG: Record<StatusType, { label: string; dot: string; badge: string; border: string }> = {
  'pvc-ready':  { label: 'PVC Ready',    dot: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200', border: 'border-l-emerald-400' },
  'pvc-pending':{ label: 'PVC Pending',  dot: 'bg-amber-400',   badge: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',       border: 'border-l-amber-400'   },
  'active':     { label: 'Billing',      dot: 'bg-sky-400',     badge: 'bg-sky-50 text-sky-700 ring-1 ring-sky-200',             border: 'border-l-sky-400'     },
  'setup':      { label: 'Setup',        dot: 'bg-slate-300',   badge: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200',      border: 'border-l-slate-200'   },
};

function StatusBadge({ contract }: { contract: Contract }) {
  const status = getContractStatus(contract);
  const cfg = STATUS_CONFIG[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${cfg.badge}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
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
      .then((r) => r.json())
      .then((data) => setBills((Array.isArray(data) ? data : data.data || []).slice(0, 10)))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [contract.id, open]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-200">
          <Receipt className="h-3.5 w-3.5" />
          {contract._count.bills} bill{contract._count.bills !== 1 ? 's' : ''}
        </button>
      </DialogTrigger>
      <DialogContent className="max-h-[82vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">{contract.agreementNo}</DialogTitle>
          <p className="text-sm text-slate-500">{contract.contractorName}</p>
        </DialogHeader>
        {loading ? (
          <div className="flex justify-center py-10"><LoadingSpinner text="Loading bills…" /></div>
        ) : error ? (
          <StatusMessage type="error" title="Error" message={error} />
        ) : bills.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="mb-4 rounded-full bg-slate-100 p-4"><FileText className="h-8 w-8 text-slate-400" /></div>
            <p className="font-semibold text-slate-800">No bills yet</p>
            <p className="mt-1 text-sm text-slate-500">Create the first bill for this contract.</p>
            <Button asChild size="sm" className="mt-4">
              <Link href={`/bills/new?contractId=${contract.id}`}>
                <Plus className="mr-1.5 h-4 w-4" /> Create first bill
              </Link>
            </Button>
          </div>
        ) : (
          <>
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-200 bg-slate-50">
                  <tr>
                    {['Bill no', 'Quarter', 'Bill amount', 'PVC', 'Cumulative', 'Measured', ''].map((h) => (
                      <th key={h} className={`px-3 py-2.5 text-xs font-semibold text-slate-500 ${h && h !== 'Bill no' && h !== 'Quarter' && h !== 'Measured' ? 'text-right' : 'text-left'}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {bills.map((bill) => (
                    <tr key={bill.id} className="hover:bg-slate-50">
                      <td className="px-3 py-2.5 font-semibold text-slate-900">{bill.billNo}</td>
                      <td className="px-3 py-2.5 text-slate-600">{bill.quarter}</td>
                      <td className="px-3 py-2.5 text-right font-medium">{fmtCurrencyFull(bill.billAmount)}</td>
                      <td className="px-3 py-2.5 text-right">
                        {bill.pvcCalculation ? (
                          <span className={bill.pvcCalculation.totalPvc >= 0 ? 'font-semibold text-emerald-700' : 'font-semibold text-red-600'}>
                            {fmtCurrencyFull(bill.pvcCalculation.totalPvc)}
                          </span>
                        ) : <span className="text-slate-400">Pending</span>}
                      </td>
                      <td className="px-3 py-2.5 text-right text-slate-700">
                        {bill.pvcCalculation ? fmtCurrencyFull(bill.pvcCalculation.cumulativePvc) : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-slate-500">{dateLabel(bill.dateOfMeasurement)}</td>
                      <td className="px-3 py-2.5 text-right">
                        <Link href={`/bills/${bill.id}`} className="inline-flex rounded-lg p-1.5 text-slate-400 hover:bg-sky-50 hover:text-sky-700">
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
        <button
          aria-label={`Delete ${contract.agreementNo}`}
          className="rounded-lg p-2 text-slate-300 transition-colors hover:bg-red-50 hover:text-red-500"
          disabled={loading}
        >
          {loading ? <LoadingSpinner size="sm" /> : <Trash2 className="h-4 w-4" />}
        </button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete contract?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently delete <strong>{contract.agreementNo}</strong>, including all bills and PVC calculations linked to it. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-red-600 text-white hover:bg-red-700"
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
      .then((r) => { if (!r.ok) throw new Error('Failed to fetch'); return r.json(); })
      .then(setContracts)
      .catch((err) => setError(err.message))
      .finally(() => setIsLoading(false));
  }, []);

  const filtered = useMemo(() => {
    let list = [...contracts];
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((c) =>
        [c.agreementNo, c.contractorName, c.workDescription, c.loaNo || '', c.user?.name || '', c.user?.email || '']
          .some((v) => v.toLowerCase().includes(q))
      );
    }
    if (statusFilter !== 'all') {
      list = list.filter((c) => {
        if (statusFilter === 'needs-action') return contractAttentionReasons(c).length > 0;
        if (statusFilter === 'active') return c._count.bills > 0;
        if (statusFilter === 'no-bills') return c._count.bills === 0;
        if (statusFilter === 'with-pvc') return c._count.pvcCalculations > 0;
        if (statusFilter === 'not-eligible') return !c.pvcApplicable;
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
    const active = contracts.filter((c) => c._count.bills > 0).length;
    const pvcDone = contracts.filter((c) => c._count.pvcCalculations > 0).length;
    const needsAction = contracts.filter((c) => contractAttentionReasons(c).length > 0).length;
    const totalBills = contracts.reduce((s, c) => s + c._count.bills, 0);
    const totalValue = contracts.reduce((s, c) => s + toNumber(c.contractValue || c.tenderAdvertisedValue), 0);
    return { active, needsAction, pvcDone, totalBills, totalValue, total: contracts.length };
  }, [contracts]);

  const attentionContracts = useMemo(
    () => contracts.filter((c) => contractAttentionReasons(c).length > 0).slice(0, 4),
    [contracts]
  );

  const handleDelete = async (id: string) => {
    const r = await fetch(`/api/contracts/${id}`, { method: 'DELETE' });
    if (!r.ok) {
      const data = await r.json().catch(() => ({}));
      setError(data.error || 'Failed to delete contract');
      return;
    }
    setContracts((cur) => cur.filter((c) => c.id !== id));
  };

  const resetFilters = () => { setSearch(''); setStatusFilter('all'); setSortBy('newest'); };
  const hasFilters = search || statusFilter !== 'all' || sortBy !== 'newest';

  if (isLoading) {
    return (
      <div className="flex min-h-[420px] items-center justify-center">
        <LoadingSpinner size="lg" text="Loading contracts…" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <PostingDetailsNotice />

      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Contracts</h1>
          <p className="mt-0.5 text-sm text-slate-500">Manage agreements, bills, and PVC calculations.</p>
        </div>
        <Button asChild className="shrink-0">
          <Link href="/contracts/new">
            <Plus className="mr-2 h-4 w-4" /> New contract
          </Link>
        </Button>
      </div>

      {error && <div className="mt-4"><StatusMessage type="error" title="Error" message={error} /></div>}

      {/* ── Stats strip ─────────────────────────────────────────────────── */}
      {contracts.length > 0 && (
        <div className="mt-6 flex flex-wrap gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200 shadow-sm">
          {[
            { label: 'Total', value: stats.total, sub: `${stats.active} active`, color: 'text-slate-900' },
            { label: 'Portfolio', value: fmtCurrency(stats.totalValue) === '—' ? 'Not set' : fmtCurrency(stats.totalValue), sub: 'Contract value', color: 'text-emerald-700' },
            { label: 'Bills', value: stats.totalBills, sub: 'Across all contracts', color: 'text-sky-700' },
            { label: 'PVC Ready', value: stats.pvcDone, sub: 'With calculations', color: 'text-violet-700' },
            { label: 'Action needed', value: stats.needsAction, sub: 'Missing data', color: stats.needsAction > 0 ? 'text-amber-600' : 'text-slate-400' },
          ].map(({ label, value, sub, color }) => (
            <div key={label} className="flex flex-1 flex-col items-center gap-0.5 bg-white px-5 py-4 text-center min-w-[100px]">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</p>
              <p className={`text-xl font-bold ${color}`}>{value}</p>
              <p className="text-xs text-slate-400">{sub}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Attention banner ────────────────────────────────────────────── */}
      {attentionContracts.length > 0 && (
        <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="mb-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <p className="text-sm font-semibold text-amber-800">Needs attention</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {attentionContracts.map((c) => (
              <Link
                key={c.id}
                href={`/contracts/${c.id}`}
                className="group flex items-center justify-between gap-2 rounded-lg border border-amber-200 bg-white px-3 py-2.5 text-sm transition-all hover:border-amber-300 hover:shadow-sm"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-900">{c.agreementNo}</p>
                  <p className="truncate text-xs text-amber-600">{contractAttentionReasons(c).join(' · ')}</p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-amber-400 transition-transform group-hover:translate-x-0.5" />
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ── Search + filters ────────────────────────────────────────────── */}
      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Search by agreement, contractor, work, or LOA…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10 rounded-lg pl-9"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-10 w-40 rounded-lg">
              <Filter className="mr-2 h-3.5 w-3.5 text-slate-400" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All contracts</SelectItem>
              <SelectItem value="needs-action">Needs action</SelectItem>
              <SelectItem value="active">With bills</SelectItem>
              <SelectItem value="no-bills">No bills</SelectItem>
              <SelectItem value="with-pvc">PVC ready</SelectItem>
              <SelectItem value="not-eligible">Not eligible</SelectItem>
            </SelectContent>
          </Select>

          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="h-10 w-40 rounded-lg">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest first</SelectItem>
              <SelectItem value="oldest">Oldest first</SelectItem>
              <SelectItem value="agreement">Agreement no.</SelectItem>
              <SelectItem value="contractor">Contractor</SelectItem>
              <SelectItem value="bills">Most bills</SelectItem>
              <SelectItem value="value">Highest value</SelectItem>
            </SelectContent>
          </Select>

          {/* View toggle */}
          <div className="flex overflow-hidden rounded-lg border border-slate-200">
            {(['grid', 'table'] as const).map((mode, i) => (
              <button
                key={mode}
                aria-label={`${mode} view`}
                onClick={() => { setViewMode(mode); localStorage.setItem('contractsViewMode', mode); }}
                className={`grid h-10 w-10 place-items-center ${i > 0 ? 'border-l border-slate-200' : ''} transition-colors ${viewMode === mode ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
              >
                {mode === 'grid' ? <LayoutGrid className="h-4 w-4" /> : <LayoutList className="h-4 w-4" />}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Result count + clear */}
      <div className="mt-3 flex items-center justify-between text-sm text-slate-500">
        <span>
          {filtered.length === contracts.length
            ? <>{contracts.length} contract{contracts.length !== 1 ? 's' : ''}</>
            : <><strong className="text-slate-800">{filtered.length}</strong> of {contracts.length} contracts</>}
        </span>
        {hasFilters && (
          <button onClick={resetFilters} className="flex items-center gap-1 rounded-md px-2 py-1 font-medium text-sky-700 hover:bg-sky-50">
            <X className="h-3.5 w-3.5" /> Clear filters
          </button>
        )}
      </div>

      {/* ── Empty state ─────────────────────────────────────────────────── */}
      {filtered.length === 0 && (
        <div className="mt-6 flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-20 text-center">
          <div className="mb-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <ClipboardList className="h-10 w-10 text-slate-400" />
          </div>
          <p className="text-lg font-semibold text-slate-800">
            {contracts.length === 0 ? 'No contracts yet' : 'No matching contracts'}
          </p>
          <p className="mt-1.5 max-w-sm text-sm text-slate-500">
            {contracts.length === 0
              ? 'Add your first contract to start tracking bills and PVC calculations.'
              : 'Try adjusting the search or filters.'}
          </p>
          {contracts.length === 0 ? (
            <Button asChild className="mt-6">
              <Link href="/contracts/new">
                <Plus className="mr-2 h-4 w-4" /> Create first contract
              </Link>
            </Button>
          ) : (
            <Button variant="outline" onClick={resetFilters} className="mt-6">
              Clear filters
            </Button>
          )}
        </div>
      )}

      {/* ── Grid view ───────────────────────────────────────────────────── */}
      {filtered.length > 0 && viewMode === 'grid' && (
        <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
          {filtered.map((contract) => {
            const reasons = contractAttentionReasons(contract);
            const mainValue = contract.contractValue || contract.tenderAdvertisedValue;
            const status = getContractStatus(contract);
            const cfg = STATUS_CONFIG[status];

            return (
              <div
                key={contract.id}
                className={`group relative overflow-hidden rounded-2xl border border-slate-200 border-l-4 bg-white shadow-sm transition-all hover:shadow-md ${cfg.border}`}
              >
                {/* Card header */}
                <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/contracts/${contract.id}`}
                        className="text-base font-bold text-slate-900 hover:text-sky-700 transition-colors"
                      >
                        {contract.agreementNo}
                      </Link>
                      <StatusBadge contract={contract} />
                    </div>
                    <p className="mt-1 line-clamp-1 text-sm text-slate-500">{contract.workDescription}</p>
                  </div>
                  <DeleteButton contract={contract} onDelete={handleDelete} />
                </div>

                {/* Card body */}
                <div className="border-t border-slate-100 px-5 py-4">
                  <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Contractor</p>
                      <p className="mt-0.5 truncate text-sm font-semibold text-slate-800">{contract.contractorName}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Value</p>
                      <p className="mt-0.5 text-sm font-bold text-emerald-600">{fmtCurrencyFull(mainValue)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Opening date</p>
                      <p className="mt-0.5 text-sm text-slate-700">{dateLabel(contract.dateOfOpening)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Base month</p>
                      <p className="mt-0.5 text-sm text-slate-700">{dateLabel(contract.baseMonth, 'MMM yyyy')}</p>
                    </div>
                  </div>

                  {/* Pills row */}
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <BillsDialog contract={contract} />
                    <span className="inline-flex items-center gap-1.5 rounded-lg bg-violet-50 px-2.5 py-1.5 text-xs font-semibold text-violet-700">
                      <TrendingUp className="h-3.5 w-3.5" />
                      {contract._count.pvcCalculations} PVC
                    </span>
                    {contract.loaNo && (
                      <span className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-600">
                        LOA {contract.loaNo}
                      </span>
                    )}
                    {!contract.pvcApplicable && (
                      <span className="inline-flex items-center rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs text-slate-500">Not eligible</span>
                    )}
                  </div>

                  {/* Attention notice */}
                  {reasons.length > 0 && (
                    <div className="mt-3 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                      <span><strong>Needs:</strong> {reasons.join(' · ')}</span>
                    </div>
                  )}

                  {/* Footer actions */}
                  <div className="mt-4 flex items-center justify-between gap-2 border-t border-slate-100 pt-4">
                    <p className="truncate text-xs text-slate-400">
                      {contract.user ? (contract.user.name || contract.user.email) : 'No owner'}
                    </p>
                    <div className="flex items-center gap-1">
                      <Link
                        href={`/contracts/${contract.id}/edit`}
                        className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                        aria-label="Edit"
                      >
                        <Edit2 className="h-4 w-4" />
                      </Link>
                      <Link
                        href={`/contracts/${contract.id}`}
                        className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-sky-50 hover:text-sky-700"
                        aria-label="View"
                      >
                        <Eye className="h-4 w-4" />
                      </Link>
                      <Link
                        href={`/bills/new?contractId=${contract.id}`}
                        className="ml-1 inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-700"
                      >
                        <Plus className="h-3.5 w-3.5" /> Bill
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Table view ──────────────────────────────────────────────────── */}
      {filtered.length > 0 && viewMode === 'table' && (
        <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1020px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  {['Agreement', 'Contractor', 'Value', 'Dates', 'Bills', 'PVC', 'Status', ''].map((h) => (
                    <th key={h} className={`px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-400 ${h === 'Value' || h === '' ? 'text-right' : 'text-left'}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((contract) => {
                  const reasons = contractAttentionReasons(contract);
                  const status = getContractStatus(contract);
                  const cfg = STATUS_CONFIG[status];
                  return (
                    <tr key={contract.id} className="group hover:bg-slate-50/70">
                      <td className="px-4 py-3.5">
                        <div className={`mb-1 inline-block h-1 w-8 rounded-full ${cfg.dot}`} />
                        <Link href={`/contracts/${contract.id}`} className="block font-bold text-slate-900 hover:text-sky-700">
                          {contract.agreementNo}
                        </Link>
                        <p className="mt-0.5 max-w-[220px] truncate text-xs text-slate-500">{contract.workDescription}</p>
                      </td>
                      <td className="px-4 py-3.5">
                        <p className="max-w-[180px] truncate font-medium text-slate-800">{contract.contractorName}</p>
                        <p className="text-xs text-slate-400">{contract.loaNo || 'No LOA'}</p>
                      </td>
                      <td className="px-4 py-3.5 text-right font-bold text-emerald-600">
                        {fmtCurrencyFull(contract.contractValue || contract.tenderAdvertisedValue)}
                      </td>
                      <td className="px-4 py-3.5">
                        <p className="text-slate-700">{dateLabel(contract.dateOfOpening)}</p>
                        <p className="text-xs text-slate-400">Base {dateLabel(contract.baseMonth, 'MMM yyyy')}</p>
                      </td>
                      <td className="px-4 py-3.5">
                        <BillsDialog contract={contract} />
                      </td>
                      <td className="px-4 py-3.5 font-semibold text-slate-700">{contract._count.pvcCalculations}</td>
                      <td className="px-4 py-3.5">
                        <StatusBadge contract={contract} />
                        {reasons.length > 0 && <p className="mt-1 text-xs text-amber-600">{reasons[0]}</p>}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center justify-end gap-1">
                          <Link href={`/contracts/${contract.id}`} className="rounded-lg p-2 text-slate-400 hover:bg-sky-50 hover:text-sky-700" aria-label="View">
                            <Eye className="h-4 w-4" />
                          </Link>
                          <Link href={`/contracts/${contract.id}/edit`} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Edit">
                            <Edit2 className="h-4 w-4" />
                          </Link>
                          <Link href={`/bills/new?contractId=${contract.id}`} className="rounded-lg p-2 text-slate-400 hover:bg-emerald-50 hover:text-emerald-700" aria-label="New bill">
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
