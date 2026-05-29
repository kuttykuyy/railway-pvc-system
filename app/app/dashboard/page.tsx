
'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  Building2, 
  FileText, 
  TrendingUp, 
  DollarSign,
  Clock,
  CheckCircle,
  Activity,
  Users,
  BarChart3,
  PieChart,
  ArrowUpRight,
  ArrowDownRight,
  Plus,
  RefreshCw,
  Eye,
  Calendar,
  ShieldCheck,
  Sparkles
} from 'lucide-react';
import { 
  LineChart, 
  Line, 
  BarChart,
  Bar,
  PieChart as RePieChart,
  Pie,
  Cell,
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer 
} from 'recharts';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { DashboardSkeleton } from '@/components/ui/skeletons/dashboard-skeleton';
import { ErrorDisplay } from '@/components/ui/error-display';
import { WhatsAppNumberAlert } from '@/components/whatsapp-number-alert';

interface DashboardData {
  overview: {
    totalContracts: number;
    activeContracts: number;
    totalBills: number;
    paidBills: number;
    pendingBills: number;
    currentMonthBills: number;
    lastMonthBills: number;
    billGrowth: number;
  };
  revenue: {
    totalRevenue: number;
    pendingRevenue: number;
    currentMonthRevenue: number;
  };
  pvc: {
    totalPvc: number;
    cumulativePvc: number;
    averagePvc: number;
  };
  contracts: {
    totalValue: number;
    totalTenderValue: number;
    averageValue: number;
  };
  monthlyTrends: Array<{
    month: string;
    count: number;
    revenue: number;
  }>;
  recentActivity: Array<{
    id: string;
    billNo: string;
    billAmount: number;
    quarter: string;
    createdAt: string;
    contract: {
      agreementNo: string;
      contractorName: string;
      workDescription: string;
    };
  }>;
  topContracts: Array<{
    id: string;
    agreementNo: string;
    contractorName: string;
    workDescription: string;
    contractValue: number | null;
    billCount: number;
  }>;
  classificationDistribution: Array<{
    classification: string;
    code: string;
    count: number;
    totalAmount: number;
  }>;
  paymentMetrics: {
    totalTransactions: number;
    successfulTransactions: number;
    successRate: number;
  };
  userStats: {
    totalUsers: number;
    activeUsers: number;
    trialUsers: number;
  } | null;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82ca9d'];

export default function DashboardPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const [data, setData] = useState<DashboardData | null>(null);
  const [userData, setUserData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const isAdmin = (session?.user as any)?.role === 'admin';

  useEffect(() => {
    fetchDashboardData();
    fetchUserData();
  }, []);

  const fetchUserData = async () => {
    try {
      const response = await fetch('/api/auth/profile');
      if (response.ok) {
        const data = await response.json();
        console.log('[Dashboard] User data fetched:', {
          hasPhone: !!data.phone,
          phone: data.phone,
          name: data.name,
          email: data.email
        });
        setUserData(data);
      } else {
        console.error('[Dashboard] Failed to fetch user data:', response.status);
      }
    } catch (error) {
      console.error('[Dashboard] Error fetching user data:', error);
    }
  };

  const fetchDashboardData = async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null); // Clear previous errors
      
      const response = await fetch('/api/dashboard');
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || errorData.error || `Failed to fetch dashboard data (${response.status})`);
      }

      const result = await response.json();
      setData(result);
    } catch (err) {
      console.error('Error fetching dashboard:', err);
      const message = err instanceof Error ? err.message : 'Failed to load dashboard. Please try again.';
      setError(message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const isNewUserForActions = data ? (data.overview.totalContracts === 0 && data.overview.totalBills === 0) : false;
  const quickActions = isNewUserForActions ? [
    {
      label: 'Step 1: Add Contract',
      description: 'Enter your agreement details',
      icon: Building2,
      onClick: () => router.push('/contracts/new'),
      color: 'bg-green-500 hover:bg-green-600',
    },
    {
      label: 'View Price Indices',
      description: 'Check current rates',
      icon: TrendingUp,
      onClick: () => router.push('/indices/view'),
      color: 'bg-orange-500 hover:bg-orange-600',
    },
    {
      label: 'How It Works',
      description: 'Quick start guide',
      icon: Eye,
      onClick: () => router.push('/getting-started'),
      color: 'bg-purple-500 hover:bg-purple-600',
    },
  ] : [
    {
      label: 'Create Bill',
      description: 'New PVC bill',
      icon: Plus,
      onClick: () => router.push('/bills/new'),
      color: 'bg-blue-500 hover:bg-blue-600',
    },
    {
      label: 'Add Contract',
      description: 'New agreement',
      icon: Building2,
      onClick: () => router.push('/contracts/new'),
      color: 'bg-green-500 hover:bg-green-600',
    },
    {
      label: 'View Bills',
      description: 'All your bills',
      icon: Eye,
      onClick: () => router.push('/bills'),
      color: 'bg-purple-500 hover:bg-purple-600',
    },
    {
      label: 'Price Indices',
      description: 'Current rates',
      icon: TrendingUp,
      onClick: () => router.push('/indices/view'),
      color: 'bg-orange-500 hover:bg-orange-600',
    },
  ];

  if (loading) {
    return <DashboardSkeleton />;
  }

  if (error || !data) {
    return (
      <div className="max-w-4xl mx-auto py-8">
        <ErrorDisplay
          title="Failed to Load Dashboard"
          message={error || 'Dashboard data is unavailable.'}
          onRetry={() => fetchDashboardData()}
          retryText="Reload Dashboard"
          showHomeButton={false}
          variant="full"
        />
      </div>
    );
  }

  const isNewUser = data.overview.totalContracts === 0 && data.overview.totalBills === 0;

  return (
    <div className="container mx-auto px-3 sm:px-4 md:px-6 py-4 sm:py-6 md:py-8 max-w-7xl">
      {/* Header with Quick Actions */}
      <div className="mb-6 md:mb-8">
        <div className="flex flex-col gap-3 sm:gap-4 mb-4 sm:mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-1 sm:mb-2">
                Dashboard
              </h1>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm sm:text-base text-gray-600">
                  Welcome back, <span className="font-semibold text-gray-900">{session?.user?.name || 'User'}</span>!
                  <span className="hidden sm:inline"> Here's an overview of your Railway PVC system.</span>
                </p>
                {userData?.emailVerified && (
                  <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-xs">
                    <ShieldCheck className="h-3 w-3 mr-1" />
                    Verified
                  </Badge>
                )}
              </div>
            </div>
            <Button
              onClick={() => {
                void fetchDashboardData(true);
              }}
              disabled={refreshing}
              variant="outline"
              size="default"
              className="w-full sm:w-auto shrink-0"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
              {refreshing ? 'Refreshing...' : 'Refresh Data'}
            </Button>
          </div>
        </div>

        {/* Posting Details Notice for Railway Officials */}

        {/* WhatsApp Number Alert for users without phone */}
        {userData && (
          <WhatsAppNumberAlert
            userEmail={userData.email}
            userName={userData.name}
            hasPhone={!!userData.phone}
          />
        )}

        {/* New User Welcome Guide */}
        {isNewUser && (
          <Card className="bg-gradient-to-br from-green-50 to-emerald-50 border-green-200 mb-4">
            <CardContent className="p-4 sm:p-6">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-green-100 rounded-full shrink-0">
                  <Sparkles className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-green-900 text-base sm:text-lg mb-1">Welcome! Let&apos;s get you started</h3>
                  <p className="text-sm text-green-700 leading-relaxed">
                    To calculate PVC for your railway work, follow these simple steps:
                    <strong> Add your contract first</strong>, then <strong>create a bill</strong> under it.
                    The system will automatically calculate PVC amounts using the latest price indices.
                  </p>
                  <p className="text-xs text-green-600 mt-2">
                    💡 Tap the <strong>purple chat button</strong> at the bottom-right anytime to ask the AI assistant for help.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Quick Actions */}
        <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-200">
          <CardHeader className="p-4 sm:p-6">
            <CardTitle className="text-base sm:text-lg flex items-center gap-2">
              <Activity className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600" />
              {isNewUser ? 'Get Started' : 'Quick Actions'}
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm">{isNewUser ? 'Follow these steps to create your first PVC bill' : 'Common tasks'}</CardDescription>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 pt-0">
            <div className={`grid gap-2 sm:gap-3 ${isNewUser ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-2 sm:grid-cols-2 lg:grid-cols-4'}`}>
              {quickActions.map((action, index) => {
                const Icon = action.icon;
                return (
                  <Button
                    key={index}
                    onClick={action.onClick}
                    className={`${action.color} text-white h-auto py-3 sm:py-4 flex flex-col items-center gap-1 sm:gap-2 transition-transform hover:scale-105`}
                    size="default"
                  >
                    <Icon className="h-5 w-5 sm:h-6 sm:w-6" />
                    <span className="text-xs sm:text-sm font-medium text-center">{action.label}</span>
                    {action.description && <span className="text-[10px] opacity-80">{action.description}</span>}
                  </Button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-6 md:mb-8">
        <Card className="border-l-4 border-l-blue-500 hover:shadow-lg transition-shadow duration-300 cursor-pointer" onClick={() => router.push('/contracts')}>
          <CardHeader className="flex flex-row items-center justify-between pb-2 p-4 sm:p-6">
            <CardTitle className="text-xs sm:text-sm font-medium text-gray-600">
              Total Contracts
            </CardTitle>
            <div className="p-1.5 sm:p-2 bg-blue-100 rounded-lg">
              <Building2 className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600" />
            </div>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 pt-0">
            <div className="text-2xl sm:text-3xl font-bold text-gray-900">{data.overview.totalContracts}</div>
            <p className="text-xs sm:text-sm text-gray-500 mt-1 flex items-center gap-1">
              <CheckCircle className="h-3 w-3 text-green-600" />
              {data.overview.activeContracts} active contracts
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-green-500 hover:shadow-lg transition-shadow duration-300 cursor-pointer" onClick={() => router.push('/bills')}>
          <CardHeader className="flex flex-row items-center justify-between pb-2 p-4 sm:p-6">
            <CardTitle className="text-xs sm:text-sm font-medium text-gray-600">
              Total Bills
            </CardTitle>
            <div className="p-1.5 sm:p-2 bg-green-100 rounded-lg">
              <FileText className="h-4 w-4 sm:h-5 sm:w-5 text-green-600" />
            </div>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 pt-0">
            <div className="text-2xl sm:text-3xl font-bold text-gray-900">{data.overview.totalBills}</div>
            <div className="flex items-center gap-1 sm:gap-2 mt-1 text-xs sm:text-sm flex-wrap">
              {data.overview.billGrowth >= 0 ? (
                <div className="flex items-center gap-1 text-green-600">
                  <ArrowUpRight className="h-3 w-3 sm:h-4 sm:w-4" />
                  <span className="font-medium">+{data.overview.billGrowth}%</span>
                </div>
              ) : (
                <div className="flex items-center gap-1 text-red-600">
                  <ArrowDownRight className="h-3 w-3 sm:h-4 sm:w-4" />
                  <span className="font-medium">{data.overview.billGrowth}%</span>
                </div>
              )}
              <span className="text-gray-500">from last month</span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-purple-500 hover:shadow-lg transition-shadow duration-300">
          <CardHeader className="flex flex-row items-center justify-between pb-2 p-4 sm:p-6">
            <CardTitle className="text-xs sm:text-sm font-medium text-gray-600">
              Total Revenue
            </CardTitle>
            <div className="p-1.5 sm:p-2 bg-purple-100 rounded-lg">
              <DollarSign className="h-4 w-4 sm:h-5 sm:w-5 text-purple-600" />
            </div>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 pt-0">
            <div className="text-2xl sm:text-3xl font-bold text-gray-900">
              ₹{(data.revenue.totalRevenue / 100000).toFixed(2)}L
            </div>
            <p className="text-xs sm:text-sm text-gray-500 mt-1 flex items-center gap-1">
              <Clock className="h-3 w-3 text-orange-600" />
              ₹{(data.revenue.pendingRevenue / 100000).toFixed(2)}L pending
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-orange-500 hover:shadow-lg transition-shadow duration-300">
          <CardHeader className="flex flex-row items-center justify-between pb-2 p-4 sm:p-6">
            <CardTitle className="text-xs sm:text-sm font-medium text-gray-600">
              Total PVC
            </CardTitle>
            <div className="p-1.5 sm:p-2 bg-orange-100 rounded-lg">
              <TrendingUp className="h-4 w-4 sm:h-5 sm:w-5 text-orange-600" />
            </div>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 pt-0">
            <div className="text-2xl sm:text-3xl font-bold text-gray-900">{formatCurrency(data.pvc.totalPvc)}</div>
            <p className="text-xs sm:text-sm text-gray-500 mt-1">
              Average: {formatCurrency(data.pvc.averagePvc)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Admin Stats */}
      {isAdmin && data.userStats && (
        <div className="mb-6 md:mb-8">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-3 sm:mb-4 flex items-center gap-2">
            <Users className="h-5 w-5 sm:h-6 sm:w-6 text-blue-600" />
            Admin Analytics
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6">
            <Card className="border-l-4 border-l-cyan-500 hover:shadow-lg transition-shadow duration-300">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">
                  Total Users
                </CardTitle>
                <div className="p-2 bg-cyan-100 rounded-lg">
                  <Users className="h-5 w-5 text-cyan-600" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-gray-900">{data.userStats.totalUsers}</div>
                <p className="text-sm text-gray-500 mt-1 flex items-center gap-1">
                  <Activity className="h-3 w-3 text-green-600" />
                  {data.userStats.activeUsers} active users
                </p>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-emerald-500 hover:shadow-lg transition-shadow duration-300">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">
                  Payment Success Rate
                </CardTitle>
                <div className="p-2 bg-emerald-100 rounded-lg">
                  <CheckCircle className="h-5 w-5 text-emerald-600" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-gray-900">{data.paymentMetrics.successRate}%</div>
                <p className="text-sm text-gray-500 mt-1">
                  {data.paymentMetrics.successfulTransactions} / {data.paymentMetrics.totalTransactions} successful
                </p>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-amber-500 hover:shadow-lg transition-shadow duration-300">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">
                  Trial Users
                </CardTitle>
                <div className="p-2 bg-amber-100 rounded-lg">
                  <Clock className="h-5 w-5 text-amber-600" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-gray-900">{data.userStats.trialUsers}</div>
                <p className="text-sm text-gray-500 mt-1">
                  Users on free trial
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Charts Row */}
      <div className="mb-6 md:mb-8">
        <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-3 sm:mb-4 flex items-center gap-2">
          <BarChart3 className="h-5 w-5 sm:h-6 sm:w-6 text-blue-600" />
          Analytics & Trends
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          {/* Monthly Trends */}
          <Card className="hover:shadow-lg transition-shadow duration-300">
            <CardHeader className="bg-gradient-to-br from-blue-50 to-cyan-50 border-b p-4 sm:p-6">
              <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                <TrendingUp className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600" />
                Monthly Bill Trends
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm">Bills and revenue over the last 6 months</CardDescription>
            </CardHeader>
            <CardContent className="pt-4 sm:pt-6 p-2 sm:p-6">
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={data.monthlyTrends}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis 
                    dataKey="month" 
                    tick={{ fill: '#6b7280' }}
                    tickLine={{ stroke: '#e5e7eb' }}
                  />
                  <YAxis 
                    yAxisId="left"
                    tick={{ fill: '#6b7280' }}
                    tickLine={{ stroke: '#e5e7eb' }}
                  />
                  <YAxis 
                    yAxisId="right" 
                    orientation="right"
                    tick={{ fill: '#6b7280' }}
                    tickLine={{ stroke: '#e5e7eb' }}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#fff',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
                    }}
                  />
                  <Legend />
                  <Line 
                    yAxisId="left"
                    type="monotone" 
                    dataKey="count" 
                    stroke="#3B82F6" 
                    strokeWidth={3}
                    name="Bills"
                    dot={{ fill: '#3B82F6', r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                  <Line 
                    yAxisId="right"
                    type="monotone" 
                    dataKey="revenue" 
                    stroke="#10B981" 
                    strokeWidth={3}
                    name="Revenue (₹)"
                    dot={{ fill: '#10B981', r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Classification Distribution */}
          <Card className="hover:shadow-lg transition-shadow duration-300">
            <CardHeader className="bg-gradient-to-br from-purple-50 to-pink-50 border-b p-4 sm:p-6">
              <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                <PieChart className="h-4 w-4 sm:h-5 sm:w-5 text-purple-600" />
                Work Classification Distribution
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm">Bills by work classification</CardDescription>
            </CardHeader>
            <CardContent className="pt-4 sm:pt-6 p-2 sm:p-6">
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={data.classificationDistribution}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis 
                    dataKey="code"
                    tick={{ fill: '#6b7280' }}
                    tickLine={{ stroke: '#e5e7eb' }}
                  />
                  <YAxis 
                    tick={{ fill: '#6b7280' }}
                    tickLine={{ stroke: '#e5e7eb' }}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#fff',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
                    }}
                  />
                  <Legend />
                  <Bar 
                    dataKey="count" 
                    fill="#8B5CF6" 
                    name="Bill Count"
                    radius={[8, 8, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Top Contracts */}
      <Card className="mb-6 md:mb-8 hover:shadow-lg transition-shadow duration-300">
        <CardHeader className="bg-gradient-to-br from-indigo-50 to-blue-50 border-b p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                <Building2 className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600" />
                Top Contracts by Activity
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm">Contracts with the most bills processed</CardDescription>
            </div>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => router.push('/contracts')}
              className="w-full sm:w-auto"
            >
              <Eye className="h-4 w-4 mr-2" />
              View All
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-4 sm:pt-6 p-4 sm:p-6">
          {data.topContracts.length > 0 ? (
            <div className="space-y-4">
              {data.topContracts.map((contract, index) => (
                <div 
                  key={contract.id} 
                  className="flex items-center justify-between p-4 border-l-4 border-l-blue-500 bg-gradient-to-r from-blue-50 to-transparent rounded-lg hover:shadow-md transition-all duration-300 cursor-pointer"
                  onClick={() => router.push(`/contracts/${contract.id}`)}
                >
                  <div className="flex items-center gap-4 flex-1">
                    <div className={`flex items-center justify-center w-10 h-10 rounded-full font-bold text-lg ${
                      index === 0 ? 'bg-yellow-100 text-yellow-700' :
                      index === 1 ? 'bg-gray-100 text-gray-700' :
                      index === 2 ? 'bg-orange-100 text-orange-700' :
                      'bg-blue-100 text-blue-600'
                    }`}>
                      {index + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold text-gray-900 mb-1">{contract.contractorName}</h4>
                      <p className="text-sm text-gray-600 mb-1">{contract.agreementNo}</p>
                      <p className="text-xs text-gray-500 line-clamp-1">{contract.workDescription}</p>
                    </div>
                  </div>
                  <div className="text-right ml-4">
                    <Badge className="mb-2 bg-blue-600 text-white">
                      {contract.billCount} {contract.billCount === 1 ? 'bill' : 'bills'}
                    </Badge>
                    {contract.contractValue && (
                      <p className="text-sm font-semibold text-gray-700">
                        {formatCurrency(contract.contractValue)}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <Building2 className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No contracts found</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Activity */}
      <Card className="hover:shadow-lg transition-shadow duration-300">
        <CardHeader className="bg-gradient-to-br from-green-50 to-emerald-50 border-b p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                <Activity className="h-4 w-4 sm:h-5 sm:w-5 text-green-600" />
                Recent Activity
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm">Latest bills processed in the system</CardDescription>
            </div>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => router.push('/bills')}
              className="w-full sm:w-auto"
            >
              <Eye className="h-4 w-4 mr-2" />
              View All
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-4 sm:pt-6 p-4 sm:p-6">
          {data.recentActivity.length > 0 ? (
            <div className="space-y-3">
              {data.recentActivity.map((bill) => (
                <div 
                  key={bill.id} 
                  className="flex items-center justify-between p-4 border-l-4 border-l-green-500 bg-gradient-to-r from-green-50 to-transparent rounded-lg hover:shadow-md transition-all duration-300 cursor-pointer"
                  onClick={() => router.push(`/bills/${bill.id}`)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <h4 className="font-semibold text-gray-900">Bill {bill.billNo}</h4>
                      <Badge variant="outline" className="bg-white">
                        {bill.quarter}
                      </Badge>
                    </div>
                    <p className="text-sm text-gray-700 font-medium mb-1">{bill.contract.contractorName}</p>
                    <p className="text-xs text-gray-600 mb-1 line-clamp-1">{bill.contract.workDescription}</p>
                    <p className="text-xs text-gray-500">{bill.contract.agreementNo}</p>
                  </div>
                  <div className="text-right ml-4">
                    <p className="font-bold text-gray-900 text-lg">{formatCurrency(bill.billAmount)}</p>
                    <p className="text-xs text-gray-500 mt-1 flex items-center justify-end gap-1">
                      <Calendar className="h-3 w-3" />
                      {formatDate(bill.createdAt)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No recent activity</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
