
'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Building2, FileText, TrendingUp, CheckCircle, Activity, Users, Plus, RefreshCw, Eye, Calendar, Clock, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import dynamic from 'next/dynamic';

// recharts is heavy; load the chart only on the client, on demand, so it stays
// out of the dashboard's initial JS.
const MonthlyTrendChart = dynamic(() => import('@/components/dashboard/monthly-trend-chart'), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse rounded bg-gray-100" />,
});
import { formatCurrency, formatDate } from '@/lib/utils';
import { DashboardSkeleton } from '@/components/ui/skeletons/dashboard-skeleton';
import { ErrorDisplay } from '@/components/ui/error-display';
import { PromoPopup } from '@/components/promo-popup';
import Link from 'next/link';

interface DashboardData {
  overview: {
    totalContracts: number;
    activeContracts: number;
    totalBills: number;
    currentMonthBills: number;
    lastMonthBills: number;
    billGrowth: number;
  };
  pvc: { totalPvc: number; averagePvc: number };
  monthlyTrends: Array<{ month: string; count: number; revenue: number }>;
  recentActivity: Array<{
    id: string; billNo: string; billAmount: number; quarter: string; createdAt: string;
    contract: { agreementNo: string; contractorName: string; workDescription: string };
  }>;
  topContracts: Array<{
    id: string; agreementNo: string; contractorName: string; workDescription: string;
    contractValue: number | null; billCount: number;
  }>;
  paymentMetrics: { totalTransactions: number; successfulTransactions: number; successRate: number };
  userStats: { totalUsers: number; activeUsers: number; trialUsers: number } | null;
}

export default function DashboardPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [hasFreeTrial, setHasFreeTrial] = useState<boolean | null>(null);
  const isAdmin = (session?.user as any)?.role === 'admin';

  useEffect(() => {
    fetchDashboardData();
    fetch('/api/user/profile')
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d) setHasFreeTrial(!!d.hasFreeTrial); })
      .catch(() => {});
  }, []);

  const fetchDashboardData = async (isRefresh = false) => {
    try {
      isRefresh ? setRefreshing(true) : setLoading(true);
      setError(null);
      const res = await fetch('/api/dashboard');
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.message || e.error || 'Failed'); }
      setData(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  if (loading) return <DashboardSkeleton />;
  if (error || !data) return (
    <div className="max-w-4xl mx-auto py-8">
      <ErrorDisplay title="Failed to Load Dashboard" message={error || 'Dashboard data unavailable.'} onRetry={() => fetchDashboardData()} retryText="Reload" showHomeButton={false} variant="full" />
    </div>
  );

  const isNewUser = data.overview.totalContracts === 0 && data.overview.totalBills === 0;

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Welcome back, <span className="font-medium text-gray-700">{session?.user?.name || 'User'}</span>
          </p>
        </div>
        <button onClick={() => fetchDashboardData(true)} disabled={refreshing}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {/* Free Trial Banner */}
      {hasFreeTrial && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-3">
          <span className="text-2xl">🎉</span>
          <div>
            <p className="text-sm font-bold text-green-800">Free Trial Active — Your first bill is FREE!</p>
            <p className="text-xs text-green-700 mt-0.5">
              Create your first PVC bill at no cost. A watermark will appear on the trial PDF.{' '}
              <Link href="/bills/new" className="underline font-semibold">Create bill now →</Link>
            </p>
          </div>
        </div>
      )}

      {/* New user welcome */}
      {isNewUser && !hasFreeTrial && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-800">
          <p className="font-semibold mb-1">Getting started</p>
          <p>Add your first contract, then create a bill under it. The system will automatically calculate PVC using the latest price indices.</p>
        </div>
      )}

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2">
        <Link href="/bills/new" className="inline-flex items-center gap-1.5 px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">
          <Plus className="h-4 w-4" /> Create Bill
        </Link>
        <Link href="/contracts/new" className="inline-flex items-center gap-1.5 px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700">
          <Building2 className="h-4 w-4" /> Add Contract
        </Link>
        <Link href="/bills" className="inline-flex items-center gap-1.5 px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">
          <Eye className="h-4 w-4" /> View Bills
        </Link>
        <Link href="/indices/view" className="inline-flex items-center gap-1.5 px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">
          <TrendingUp className="h-4 w-4" /> Price Indices
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div onClick={() => router.push('/contracts')} className="bg-white border border-gray-200 rounded-lg px-4 py-3 cursor-pointer hover:shadow-sm transition-shadow border-l-4 border-l-emerald-500">
          <div className="flex items-center gap-1.5 mb-1">
            <Building2 className="h-4 w-4 text-emerald-500" />
            <span className="text-xs text-gray-400 uppercase tracking-wide">Contracts</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{data.overview.totalContracts}</p>
          <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
            <CheckCircle className="h-3 w-3 text-green-500" /> {data.overview.activeContracts} active
          </p>
        </div>

        <div onClick={() => router.push('/bills')} className="bg-white border border-gray-200 rounded-lg px-4 py-3 cursor-pointer hover:shadow-sm transition-shadow border-l-4 border-l-green-500">
          <div className="flex items-center gap-1.5 mb-1">
            <FileText className="h-4 w-4 text-green-500" />
            <span className="text-xs text-gray-400 uppercase tracking-wide">Bills</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{data.overview.totalBills}</p>
          <p className="text-xs mt-0.5 flex items-center gap-1">
            {data.overview.billGrowth >= 0
              ? <><ArrowUpRight className="h-3 w-3 text-green-500" /><span className="text-green-600">+{data.overview.billGrowth}%</span></>
              : <><ArrowDownRight className="h-3 w-3 text-red-500" /><span className="text-red-600">{data.overview.billGrowth}%</span></>}
            <span className="text-gray-400">vs last month</span>
          </p>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg px-4 py-3 border-l-4 border-l-orange-500">
          <div className="flex items-center gap-1.5 mb-1">
            <TrendingUp className="h-4 w-4 text-orange-500" />
            <span className="text-xs text-gray-400 uppercase tracking-wide">Total PVC</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{formatCurrency(data.pvc.totalPvc)}</p>
          <p className="text-xs text-gray-400 mt-0.5">Avg: {formatCurrency(data.pvc.averagePvc)}</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg px-4 py-3 border-l-4 border-l-emerald-500">
          <div className="flex items-center gap-1.5 mb-1">
            <Activity className="h-4 w-4 text-emerald-500" />
            <span className="text-xs text-gray-400 uppercase tracking-wide">This Month</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{data.overview.currentMonthBills}</p>
          <p className="text-xs text-gray-400 mt-0.5">{data.overview.lastMonthBills} last month</p>
        </div>
      </div>

      {/* Admin stats */}
      {isAdmin && data.userStats && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-white border border-gray-200 rounded-lg px-4 py-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Users className="h-4 w-4 text-emerald-500" />
              <span className="text-xs text-gray-400 uppercase tracking-wide">Total Users</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{data.userStats.totalUsers}</p>
            <p className="text-xs text-gray-400 mt-0.5">{data.userStats.activeUsers} active</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg px-4 py-3">
            <div className="flex items-center gap-1.5 mb-1">
              <CheckCircle className="h-4 w-4 text-emerald-500" />
              <span className="text-xs text-gray-400 uppercase tracking-wide">Payment Success</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{data.paymentMetrics.successRate}%</p>
            <p className="text-xs text-gray-400 mt-0.5">{data.paymentMetrics.successfulTransactions}/{data.paymentMetrics.totalTransactions} transactions</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg px-4 py-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Clock className="h-4 w-4 text-amber-500" />
              <span className="text-xs text-gray-400 uppercase tracking-wide">Trial Users</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{data.userStats.trialUsers}</p>
            <p className="text-xs text-gray-400 mt-0.5">on free trial</p>
          </div>
        </div>
      )}

      {/* Monthly trend chart */}
      {data.monthlyTrends.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Monthly Bill Trend</h2>
          <div className="h-52">
            <MonthlyTrendChart data={data.monthlyTrends} />
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top Contracts */}
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900 text-sm">Top Contracts</h2>
            <Link href="/contracts" className="text-xs text-emerald-600 hover:underline">View all →</Link>
          </div>
          {data.topContracts.length > 0 ? (
            <div className="divide-y divide-gray-100">
              {data.topContracts.map((c, i) => (
                <div key={c.id} onClick={() => router.push(`/contracts/${c.id}`)}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer">
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                    i === 0 ? 'bg-yellow-100 text-yellow-700' : i === 1 ? 'bg-gray-100 text-gray-600' : i === 2 ? 'bg-orange-100 text-orange-700' : 'bg-emerald-50 text-emerald-600'
                  }`}>{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{c.contractorName}</p>
                    <p className="text-xs text-gray-400 truncate">{c.agreementNo}</p>
                  </div>
                  <span className="text-xs px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full font-medium shrink-0">
                    {c.billCount} bill{c.billCount !== 1 ? 's' : ''}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-10 text-center text-sm text-gray-400">No contracts yet</div>
          )}
        </div>

        {/* Recent Activity */}
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900 text-sm">Recent Bills</h2>
            <Link href="/bills" className="text-xs text-emerald-600 hover:underline">View all →</Link>
          </div>
          {data.recentActivity.length > 0 ? (
            <div className="divide-y divide-gray-100">
              {data.recentActivity.map(bill => (
                <div key={bill.id} onClick={() => router.push(`/bills/${bill.id}`)}
                  className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 cursor-pointer">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-gray-800">Bill {bill.billNo}</span>
                      <span className="text-xs text-gray-400">{bill.quarter}</span>
                    </div>
                    <p className="text-xs text-gray-500 truncate">{bill.contract.contractorName}</p>
                    <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                      <Calendar className="h-3 w-3" />{formatDate(bill.createdAt)}
                    </p>
                  </div>
                  <p className="text-sm font-bold text-gray-900 ml-4 shrink-0">{formatCurrency(bill.billAmount)}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-10 text-center text-sm text-gray-400">No recent bills</div>
          )}
        </div>
      </div>

      {/* Cross-Promotion: Our Tools */}
      <div className="mt-6">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">More Tools for Railway Contractors</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <a href="https://primerp.in?ref=irpvc" target="_blank" rel="noopener noreferrer"
            className="group bg-gradient-to-br from-emerald-50 to-emerald-50 border border-emerald-100 rounded-xl p-5 hover:shadow-md hover:border-emerald-200 transition-all">
            <div className="flex items-start gap-4">
              <div className="bg-emerald-600 text-white rounded-lg p-2.5 font-bold text-xs shrink-0">ERP</div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-gray-900 text-sm group-hover:text-emerald-700 transition-colors">PRIME ERP</h3>
                <p className="text-xs text-gray-600 mt-1 leading-relaxed">Complete project management — USSOR/DSR billing, measurements, deviation statements, labour attendance & 30+ reports.</p>
                <div className="flex items-center gap-2 mt-3">
                  <span className="text-[10px] font-bold text-green-700 bg-green-100 px-2 py-0.5 rounded-full">14-Day Free Trial</span>
                  <span className="text-[10px] text-emerald-600 font-medium group-hover:underline">Try PRIME ERP →</span>
                </div>
              </div>
            </div>
          </a>
          <a href="https://irwcms.primerp.in?ref=irpvc" target="_blank" rel="noopener noreferrer"
            className="group bg-gradient-to-br from-emerald-50 to-emerald-50 border border-emerald-100 rounded-xl p-5 hover:shadow-md hover:border-emerald-200 transition-all">
            <div className="flex items-start gap-4">
              <div className="bg-emerald-600 text-white rounded-lg p-2.5 font-bold text-xs shrink-0">eMB</div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-gray-900 text-sm group-hover:text-emerald-700 transition-colors">IRWCMS Auto-Fill</h3>
                <p className="text-xs text-gray-600 mt-1 leading-relaxed">Chrome extension to auto-fill eMB data in IRWCMS. Stop manual data entry — fill forms with one click.</p>
                <div className="flex items-center gap-2 mt-3">
                  <span className="text-[10px] font-bold text-green-700 bg-green-100 px-2 py-0.5 rounded-full">Free Trial Available</span>
                  <span className="text-[10px] text-emerald-600 font-medium group-hover:underline">Try Auto-Fill →</span>
                </div>
              </div>
            </div>
          </a>
        </div>
      </div>

      <PromoPopup />
    </div>
  );
}
