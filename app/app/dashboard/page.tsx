
'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Building2, FileText, TrendingUp, CheckCircle, Activity, Users, Plus, RefreshCw, Eye, Calendar, Clock, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { formatCurrency, formatDate } from '@/lib/utils';
import { DashboardSkeleton } from '@/components/ui/skeletons/dashboard-skeleton';
import { ErrorDisplay } from '@/components/ui/error-display';
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
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
          <p className="font-semibold mb-1">Getting started</p>
          <p>Add your first contract, then create a bill under it. The system will automatically calculate PVC using the latest price indices.</p>
        </div>
      )}

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2">
        <Link href="/bills/new" className="inline-flex items-center gap-1.5 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">
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
        <div onClick={() => router.push('/contracts')} className="bg-white border border-gray-200 rounded-lg px-4 py-3 cursor-pointer hover:shadow-sm transition-shadow border-l-4 border-l-blue-500">
          <div className="flex items-center gap-1.5 mb-1">
            <Building2 className="h-4 w-4 text-blue-500" />
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

        <div className="bg-white border border-gray-200 rounded-lg px-4 py-3 border-l-4 border-l-purple-500">
          <div className="flex items-center gap-1.5 mb-1">
            <Activity className="h-4 w-4 text-purple-500" />
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
              <Users className="h-4 w-4 text-cyan-500" />
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
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.monthlyTrends}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }} />
                <Line type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2} name="Bills" dot={{ r: 3 }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top Contracts */}
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900 text-sm">Top Contracts</h2>
            <Link href="/contracts" className="text-xs text-blue-600 hover:underline">View all →</Link>
          </div>
          {data.topContracts.length > 0 ? (
            <div className="divide-y divide-gray-100">
              {data.topContracts.map((c, i) => (
                <div key={c.id} onClick={() => router.push(`/contracts/${c.id}`)}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer">
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                    i === 0 ? 'bg-yellow-100 text-yellow-700' : i === 1 ? 'bg-gray-100 text-gray-600' : i === 2 ? 'bg-orange-100 text-orange-700' : 'bg-blue-50 text-blue-600'
                  }`}>{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{c.contractorName}</p>
                    <p className="text-xs text-gray-400 truncate">{c.agreementNo}</p>
                  </div>
                  <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full font-medium shrink-0">
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
            <Link href="/bills" className="text-xs text-blue-600 hover:underline">View all →</Link>
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
    </div>
  );
}
