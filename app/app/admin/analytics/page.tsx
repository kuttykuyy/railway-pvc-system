'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import dynamic from 'next/dynamic';

// recharts is heavy; load these admin charts on demand so they stay out of the
// initial bundle.
const MonthlyRevenueChart = dynamic(
  () => import('@/components/admin/analytics-charts').then(m => m.MonthlyRevenueChart),
  { ssr: false, loading: () => <div className="h-[300px] w-full animate-pulse rounded bg-slate-100" /> },
);
const WeeklyTrendChart = dynamic(
  () => import('@/components/admin/analytics-charts').then(m => m.WeeklyTrendChart),
  { ssr: false, loading: () => <div className="h-[300px] w-full animate-pulse rounded bg-slate-100" /> },
);
import { TrendingUp, Users, IndianRupee, Activity } from 'lucide-react';
import { Loader2 } from 'lucide-react';

interface AnalyticsData {
  summary: {
    totalChecks: number;
    totalUsers: number;
    totalRevenue: number;
    checkGrowth: number | string;
    revenueGrowth: number | string;
    averageRevenuePerUser: string;
  };
  monthlyData: Array<{
    month: string;
    checks: number;
    users: number;
    revenue: number;
  }>;
  weeklyData: Array<{
    week: string;
    checks: number;
    users: number;
    revenue: number;
  }>;
  topContracts: Array<{
    contractId: string;
    contractNumber: string;
    checkCount: number;
    revenue: number;
  }>;
  topUsers: Array<{
    userId: string;
    name: string;
    email: string;
    checkCount: number;
    totalSpent: number;
  }>;
}

const COLORS = ['#10b981', '#10b981', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#10b981', '#f97316', '#14b8a6', '#d946ef'];

interface ActivationData {
  total: number;
  last7d: number;
  funnel: Array<{ key: string; label: string; count: number }>;
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [activation, setActivation] = useState<ActivationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState('30d');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/admin/analytics/activation')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d && !d.error) setActivation(d); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch(`/api/admin/analytics/pvc-checks?timeRange=${timeRange}`);
        if (!response.ok) throw new Error('Failed to fetch analytics');
        const analyticsData = await response.json();
        setData(analyticsData);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load analytics');
      } finally {
        setLoading(false);
      }
    };

    fetchAnalytics();
  }, [timeRange]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-center">
        <p className="text-red-600 font-semibold">Error: {error}</p>
        <Button onClick={() => window.location.reload()} className="mt-4">
          Retry
        </Button>
      </div>
    );
  }

  if (!data) return null;

  const StatCard = ({
    title,
    value,
    icon: Icon,
    subtitle,
    trend,
    trendColor,
  }: {
    title: string;
    value: string | number;
    icon: React.ReactNode;
    subtitle?: string;
    trend?: number | string;
    trendColor?: string;
  }) => (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <div className="text-muted-foreground">{Icon}</div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
        {trend !== undefined && (
          <p className={`text-xs font-semibold mt-2 ${trendColor || 'text-green-600'}`}>
            {typeof trend === 'number' && trend > 0 ? '+' : ''}{trend}% vs previous period
          </p>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">PVC Check Analytics</h1>
          <p className="text-muted-foreground mt-1">Monitor PVC check usage, revenue, and user engagement</p>
        </div>
        <div className="flex gap-2">
          {['7d', '30d', '90d', '1y', 'all'].map((range) => (
            <Button
              key={range}
              variant={timeRange === range ? 'default' : 'outline'}
              onClick={() => setTimeRange(range)}
              size="sm"
            >
              {range === '7d' ? '7 Days'
                : range === '30d' ? '30 Days'
                  : range === '90d' ? '90 Days'
                    : range === '1y' ? '1 Year'
                      : 'All Time'}
            </Button>
          ))}
        </div>
      </div>

      {/* User-movement funnel — the journey from signup to paying, and where it leaks */}
      {activation && activation.funnel.length > 0 && (
        <Card className="border-emerald-200">
          <CardHeader>
            <CardTitle>User Movement Funnel</CardTitle>
            <CardDescription>
              How contractor signups move from joining to paying, and where they drop off.
              {' '}{activation.total.toLocaleString('en-IN')} total · {activation.last7d.toLocaleString('en-IN')} in the last 7 days.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {(() => {
              const f = activation.funnel;
              const top = f[0]?.count || 0;
              // The step where the most users are lost, so it can be called out.
              let worst = { label: '', lost: 0, fromPct: 0 };
              f.forEach((st, i) => {
                if (i === 0) return;
                const lost = f[i - 1].count - st.count;
                const fromPct = f[i - 1].count > 0 ? Math.round((lost / f[i - 1].count) * 1000) / 10 : 0;
                if (lost > worst.lost) worst = { label: `${f[i - 1].label} → ${st.label}`, lost, fromPct };
              });
              return (
                <>
                  <div className="space-y-2">
                    {f.map((st, i) => {
                      const ofSignup = top > 0 ? (st.count / top) * 100 : 0;
                      const prev = i === 0 ? null : f[i - 1].count;
                      const stepPct = prev && prev > 0 ? Math.round((st.count / prev) * 1000) / 10 : null;
                      const lost = prev === null ? 0 : prev - st.count;
                      const isPaid = st.key === 'paid';
                      return (
                        <div key={st.key}>
                          {i > 0 && (
                            <div className="flex items-center justify-end gap-2 pr-1 py-0.5 text-[11px] text-slate-400">
                              {lost > 0 && <span className="text-red-500">−{lost.toLocaleString('en-IN')} dropped</span>}
                              <span>{stepPct}% continue</span>
                            </div>
                          )}
                          <div className="relative overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                            {/* The funnel bar: width = share of the top of the funnel. */}
                            <div
                              className={`h-12 ${isPaid ? 'bg-emerald-500' : 'bg-emerald-200'} transition-all`}
                              style={{ width: `${Math.max(ofSignup, 3)}%` }}
                            />
                            <div className="absolute inset-0 flex items-center justify-between px-3">
                              <span className="text-sm font-medium text-slate-800">{st.label}</span>
                              <span className="text-sm tabular-nums text-slate-700">
                                <span className="font-bold">{st.count.toLocaleString('en-IN')}</span>
                                <span className="ml-1.5 text-xs text-slate-500">{Math.round(ofSignup * 10) / 10}%</span>
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {worst.lost > 0 && (
                    <p className="mt-3 text-sm text-slate-600">
                      Biggest leak: <span className="font-semibold text-slate-800">{worst.label.toLowerCase()}</span>
                      {' '}— {worst.lost.toLocaleString('en-IN')} users lost ({worst.fromPct}% of that step). Fixing it recovers the most.
                    </p>
                  )}
                </>
              );
            })()}
          </CardContent>
        </Card>
      )}

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <StatCard
          title="Total Checks"
          value={data.summary.totalChecks.toLocaleString('en-IN')}
          icon={<Activity className="h-4 w-4" />}
          trend={typeof data.summary.checkGrowth === 'number' ? data.summary.checkGrowth : undefined}
          trendColor={typeof data.summary.checkGrowth === 'number' && data.summary.checkGrowth > 0 ? 'text-green-600' : 'text-red-600'}
        />
        <StatCard
          title="Unique Users"
          value={data.summary.totalUsers.toLocaleString('en-IN')}
          icon={<Users className="h-4 w-4" />}
          subtitle="Who used PVC Check"
        />
        <StatCard
          title="Total Revenue"
          value={`₹${(data.summary.totalRevenue / 100000).toFixed(1)}L`}
          icon={<IndianRupee className="h-4 w-4" />}
          trend={typeof data.summary.revenueGrowth === 'number' ? data.summary.revenueGrowth : undefined}
          trendColor={typeof data.summary.revenueGrowth === 'number' && data.summary.revenueGrowth > 0 ? 'text-green-600' : 'text-red-600'}
        />
        <StatCard
          title="Avg Revenue/User"
          value={`₹${data.summary.averageRevenuePerUser}`}
          icon={<IndianRupee className="h-4 w-4" />}
          subtitle="Per unique user"
        />
        <StatCard
          title="Avg Checks/User"
          value={(data.summary.totalChecks / data.summary.totalUsers || 0).toFixed(2)}
          icon={<TrendingUp className="h-4 w-4" />}
          subtitle="Engagement rate"
        />
      </div>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Monthly Trend */}
        <Card>
          <CardHeader>
            <CardTitle>Monthly Trend</CardTitle>
            <CardDescription>Checks and revenue by month</CardDescription>
          </CardHeader>
          <CardContent>
            <MonthlyRevenueChart data={data.monthlyData.reverse()} />
          </CardContent>
        </Card>

        {/* Weekly Trend */}
        <Card>
          <CardHeader>
            <CardTitle>Weekly Trend (Last 12 Weeks)</CardTitle>
            <CardDescription>Checks and users by week</CardDescription>
          </CardHeader>
          <CardContent>
            <WeeklyTrendChart data={data.weeklyData.reverse()} />
          </CardContent>
        </Card>
      </div>

      {/* Top Contracts and Users */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Top Contracts */}
        <Card>
          <CardHeader>
            <CardTitle>Top Contracts by Usage</CardTitle>
            <CardDescription>Most active contracts</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {data.topContracts.length > 0 ? (
                data.topContracts.map((contract, idx) => (
                  <div key={contract.contractId} className="flex items-center justify-between pb-3 border-b last:border-0">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 text-sm font-semibold">
                          {idx + 1}
                        </div>
                        <div>
                          <p className="font-medium text-sm">{contract.contractNumber}</p>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">{contract.checkCount}</p>
                      <p className="text-xs text-green-600">₹{contract.revenue.toLocaleString('en-IN')}</p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-muted-foreground text-sm">No data available</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Top Users */}
        <Card>
          <CardHeader>
            <CardTitle>Top Users by Spending</CardTitle>
            <CardDescription>Most engaged users</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {data.topUsers.length > 0 ? (
                data.topUsers.map((user, idx) => (
                  <div key={user.userId} className="flex items-center justify-between pb-3 border-b last:border-0">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 text-sm font-semibold">
                          {idx + 1}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">{user.name}</p>
                          <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                        </div>
                      </div>
                    </div>
                    <div className="text-right ml-2">
                      <p className="font-semibold text-sm">{user.checkCount}x</p>
                      <p className="text-xs text-emerald-600">₹{user.totalSpent.toLocaleString('en-IN')}</p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-muted-foreground text-sm">No data available</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
