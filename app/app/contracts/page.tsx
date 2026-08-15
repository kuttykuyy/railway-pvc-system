'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
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
  FolderOpen,
  IndianRupee,
  LayoutGrid,
  LayoutList,
  Plus,
  FileUp,
  Receipt,
  Search,
  Trash2,
  TrendingUp,
  X,
  Zap,
  Phone,
} from 'lucide-react';

import { CreatedViaBadge } from '@/components/ui/created-via-badge';
import { FirstBillFreeTag } from '@/components/billing/first-bill-free-tag';
import { PostingDetailsNotice } from '@/components/posting-details-notice';
import { PromoBanner } from '@/components/promo-banner';
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
  contractorPhone: string | null;
  createdVia?: string | null;
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
  'active':     { label: 'Billing',      dot: 'bg-emerald-400',     badge: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',             border: 'border-l-emerald-400'     },
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
                <FirstBillFreeTag className="ml-1.5 bg-white/20 text-white" />
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
                        <Link href={`/bills/${bill.id}`} className="inline-flex rounded-lg p-1.5 text-slate-400 hover:bg-emerald-50 hover:text-emerald-700">
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
                <Link href={`/contracts/${contract.id}`} className="text-sm font-medium text-emerald-700 hover:underline">
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
  const router = useRouter();
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [search, setSearch] = useState('');
  const [roContractQuota, setRoContractQuota] = useState<{ applicable: boolean; contracts?: { allowed: boolean; used: number; limit: number; remaining: number } } | null>(null);

  const [quotaRequestSent, setQuotaRequestSent] = useState(false);
  const [quotaRequesting, setQuotaRequesting] = useState(false);

  const requestQuotaIncrease = async () => {
    setQuotaRequesting(true);
    try {
      const r = await fetch('/api/user/request-quota-increase', { method: 'POST' });
      const d = await r.json();
      if (r.ok) setQuotaRequestSent(true);
      else alert(d.error || 'Failed to send request. Please call admin directly.');
    } catch {
      alert('Failed to send request. Please call admin directly.');
    } finally {
      setQuotaRequesting(false);
    }
  };

  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('newest');

  useEffect(() => {
    const saved = localStorage.getItem('contractsViewMode');
    if (saved === 'grid' || saved === 'table') setViewMode(saved);
    fetch('/api/contracts')
      .then((r) => { if (!r.ok) throw new Error('Failed to fetch'); return r.json(); })
      .then((data) => {
        setContracts(data);
        // First-time users: land them on the upload-first contract form instead of an
        // empty list — creating the first contract is where most signups stall (84%
        // never make one, and those who will, do it within 24h). Once per session, so
        // pressing Back never traps anyone in a redirect loop.
        if (Array.isArray(data) && data.length === 0 && !sessionStorage.getItem('irpvc-onboard-redirect')) {
          sessionStorage.setItem('irpvc-onboard-redirect', '1');
          router.push('/contracts/new?welcome=1');
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setIsLoading(false));
    fetch('/api/user/quota')
      .then(r => r.ok ? r.json() : null)
      .then(q => { if (q) setRoContractQuota(q); })
      .catch(() => {});
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
      <PromoBanner />
      <PostingDetailsNotice />

      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Contracts</h1>
          <p className="mt-0.5 text-sm text-slate-500">Manage agreements, bills, and PVC calculations.</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button asChild variant="outline">
            <Link href="/contracts/import">
              <FileUp className="mr-2 h-4 w-4" /> Import
            </Link>
          </Button>
          <Button asChild>
            <Link href="/contracts/new">
              <Plus className="mr-2 h-4 w-4" /> New contract
            </Link>
          </Button>
        </div>
      </div>

      {/* Railway Official contract quota banner */}
      {roContractQuota?.applicable && roContractQuota.contracts && roContractQuota.contracts.limit > 0 && (
        <div className={`mt-4 rounded-xl border px-4 py-3 ${
          !roContractQuota.contracts.allowed ? 'border-red-200 bg-red-50'
          : roContractQuota.contracts.remaining <= 1 ? 'border-amber-200 bg-amber-50'
          : 'border-emerald-100 bg-emerald-50/50'
        }`}>
          <div className="flex items-center gap-3">
            <div className={`shrink-0 rounded-full p-2 ${!roContractQuota.contracts.allowed ? 'bg-red-100' : roContractQuota.contracts.remaining <= 1 ? 'bg-amber-100' : 'bg-emerald-100'}`}>
              <FolderOpen className={`h-4 w-4 ${!roContractQuota.contracts.allowed ? 'text-red-600' : roContractQuota.contracts.remaining <= 1 ? 'text-amber-600' : 'text-emerald-600'}`} />
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-semibold ${!roContractQuota.contracts.allowed ? 'text-red-800' : roContractQuota.contracts.remaining <= 1 ? 'text-amber-800' : 'text-slate-800'}`}>
                {!roContractQuota.contracts.allowed ? '🚫 Contract limit reached' : 'Free account · Contract quota'}
              </p>
              <p className={`text-xs mt-0.5 ${!roContractQuota.contracts.allowed ? 'text-red-600' : roContractQuota.contracts.remaining <= 1 ? 'text-amber-700' : 'text-slate-500'}`}>
                {!roContractQuota.contracts.allowed
                  ? 'You cannot create new contracts.'
                  : `${roContractQuota.contracts.remaining} of ${roContractQuota.contracts.limit} slots remaining${roContractQuota.contracts.remaining <= 1 ? ' — request an increase below' : ''}`}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className={`text-xl font-black ${!roContractQuota.contracts.allowed ? 'text-red-700' : roContractQuota.contracts.remaining <= 1 ? 'text-amber-700' : 'text-emerald-700'}`}>
                {roContractQuota.contracts.used}<span className="text-base font-medium text-slate-400">/{roContractQuota.contracts.limit}</span>
              </p>
            </div>
          </div>

          {/* Action buttons when at or near limit */}
          {(!roContractQuota.contracts.allowed || roContractQuota.contracts.remaining <= 1) && (
            <div className="mt-3 flex flex-col sm:flex-row gap-2 pt-3 border-t border-inherit">
              {quotaRequestSent ? (
                <div className="flex items-center gap-2 text-green-700 text-xs font-semibold bg-green-50 border border-green-200 rounded-xl px-4 py-2">
                  ✓ Request sent to admin via WhatsApp. They will contact you shortly.
                </div>
              ) : (
                <button
                  onClick={requestQuotaIncrease}
                  disabled={quotaRequesting}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white text-xs font-bold px-4 py-2 transition-colors"
                >
                  <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                  {quotaRequesting ? 'Sending…' : 'Request Limit Increase via WhatsApp'}
                </button>
              )}
              <a
                href="tel:+919944776689"
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold px-4 py-2 transition-colors"
              >
                📞 Call +91 99447 76689
              </a>
            </div>
          )}
        </div>
      )}

      {error && <div className="mt-4"><StatusMessage type="error" title="Error" message={error} /></div>}

      {/* ── Stats strip ─────────────────────────────────────────────────── */}
      {contracts.length > 0 && (
        <div className="mt-6 flex flex-wrap gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200 shadow-sm">
          {[
            { label: 'Total', value: stats.total, sub: `${stats.active} active`, color: 'text-slate-900' },
            { label: 'Portfolio', value: fmtCurrency(stats.totalValue) === '—' ? 'Not set' : fmtCurrency(stats.totalValue), sub: 'Contract value', color: 'text-emerald-700' },
            { label: 'Bills', value: stats.totalBills, sub: 'Across all contracts', color: 'text-emerald-700' },
            { label: 'PVC Ready', value: stats.pvcDone, sub: 'With calculations', color: 'text-emerald-700' },
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
          <button onClick={resetFilters} className="flex items-center gap-1 rounded-md px-2 py-1 font-medium text-emerald-700 hover:bg-emerald-50">
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
            <div className="mt-6 flex w-full max-w-md flex-col items-center gap-3 px-4">
              {/* Lead with the agreement auto-fill: typing a contract by hand is the step
                  most new users stall on, and the AI upload removes almost all of it. */}
              <div className="w-full rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 text-left">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-emerald-900">
                  <FileText className="h-4 w-4" /> Fastest way — upload your agreement
                </p>
                <p className="mt-1 text-xs text-emerald-700/80">
                  Upload the railway agreement PDF and we&apos;ll fill in the agreement number, contractor,
                  dates and values for you — free. You just review and save.
                </p>
              </div>
              <Button asChild className="w-full sm:w-auto">
                <Link href="/contracts/new">
                  <FileText className="mr-2 h-4 w-4" /> Upload agreement &amp; auto-fill
                </Link>
              </Button>
              <Link href="/contracts/new" className="text-xs text-slate-500 underline underline-offset-2 hover:text-slate-700">
                or enter the details manually
              </Link>
            </div>
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
                        className="text-base font-bold text-slate-900 hover:text-emerald-700 transition-colors"
                      >
                        {contract.agreementNo}
                      </Link>
                      <StatusBadge contract={contract} />
                      <CreatedViaBadge createdVia={contract.createdVia} />
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
                      {/* Tap to call. The number is the reason anyone opens a contractor's
                          record, and it sat one screen further in. */}
                      {contract.contractorPhone && (
                        <a
                          href={`tel:${contract.contractorPhone}`}
                          onClick={(e) => e.stopPropagation()}
                          className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:text-emerald-800 hover:underline"
                        >
                          <Phone className="h-3 w-3" />
                          {contract.contractorPhone}
                        </a>
                      )}
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
                    <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700">
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
                        className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-emerald-50 hover:text-emerald-700"
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
                        <Link href={`/contracts/${contract.id}`} className="block font-bold text-slate-900 hover:text-emerald-700">
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
                          <Link href={`/contracts/${contract.id}`} className="rounded-lg p-2 text-slate-400 hover:bg-emerald-50 hover:text-emerald-700" aria-label="View">
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
