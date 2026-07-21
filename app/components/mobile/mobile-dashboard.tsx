'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Building2, 
  FileText, 
  TrendingUp, 
  AlertCircle,
  CheckCircle,
  Clock,
  Activity,
  ChevronRight,
  WifiOff,
  Plus,
  BarChart3,
} from 'lucide-react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { getClientRoleInfo } from '@/lib/role-auth-client';
import { format } from 'date-fns';
import { toISTDate } from '@/lib/ist-utils';
import { useLanguage } from '../i18n-provider';

interface DashboardStats {
  totalContracts: number;
  totalBills: number;
  pendingBills: number;
  recentActivity: number;
  totalRevenue: number;
  thisMonthBills: number;
  processingRate: number;
}

interface RecentItem {
  id: string;
  type: 'bill' | 'contract' | 'payment';
  title: string;
  subtitle: string;
  timestamp: Date;
  status: 'completed' | 'pending' | 'failed';
  amount?: number;
}

function QuickAction({ icon: Icon, label, href }: { icon: any; label: string; href: string }) {
  return (
    <Link
      href={href}
      className="flex flex-col items-center justify-center p-3 bg-white rounded-2xl border border-slate-100 hover:border-emerald-100 hover:bg-emerald-50/30 transition-all duration-200 shadow-[0_2px_8px_rgba(0,0,0,0.02)]"
    >
      <div className="h-10 w-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-1.5">
        <Icon className="h-5 w-5" strokeWidth={2} />
      </div>
      <span className="text-[10px] font-semibold text-slate-700 text-center tracking-tight leading-none">
        {label}
      </span>
    </Link>
  );
}

function MetricCard({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-[0_2px_8px_rgba(0,0,0,0.02)]">
      <p className="text-2xl font-extrabold text-slate-900">{value}</p>
      <p className="text-xs text-slate-500 mt-0.5 font-medium">{label}</p>
    </div>
  );
}

export default function MobileDashboard() {
  const { data: session } = useSession();
  const { isAdmin } = getClientRoleInfo(session);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentItems, setRecentItems] = useState<RecentItem[]>([]);
  const [creditBalance, setCreditBalance] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(true);
  const { t, language } = useLanguage();

  useEffect(() => {
    const updateOnlineStatus = () => setIsOnline(navigator.onLine);
    
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
    
    updateOnlineStatus();
    loadDashboardData();

    return () => {
      window.removeEventListener('online', updateOnlineStatus);
      window.removeEventListener('offline', updateOnlineStatus);
    };
  }, []);

  const loadDashboardData = async () => {
    setIsLoading(true);
    
    try {
      // Try to load from cache first if offline
      if (!navigator.onLine) {
        try {
          const cachedStats = JSON.parse(localStorage.getItem('dashboard_stats') || 'null');
          const cachedItems = JSON.parse(localStorage.getItem('recent_items') || '[]');
          const cachedBalance = JSON.parse(localStorage.getItem('credit_balance') || '0');
          
          if (cachedStats) setStats(cachedStats);
          if (cachedItems) setRecentItems(cachedItems);
          setCreditBalance(cachedBalance);
          
          if (cachedStats && cachedItems) {
            setIsLoading(false);
            return;
          }
        } catch (e) {
          console.error('Error loading cached data:', e);
        }
      }

      // Load dashboard stats, recent items, and credits balance
      const [statsResponse, itemsResponse, balanceResponse] = await Promise.all([
        fetch('/api/dashboard/stats'),
        fetch('/api/dashboard/recent'),
        fetch('/api/credits/balance')
      ]);

      if (statsResponse.ok) {
        const statsData = await statsResponse.json();
        setStats(statsData);
        try {
          localStorage.setItem('dashboard_stats', JSON.stringify(statsData));
        } catch (e) {
          console.error('Error caching stats:', e);
        }
      }

      if (itemsResponse.ok) {
        const itemsData = await itemsResponse.json();
        setRecentItems(itemsData);
        try {
          localStorage.setItem('recent_items', JSON.stringify(itemsData));
        } catch (e) {
          console.error('Error caching items:', e);
        }
      }

      if (balanceResponse.ok) {
        const balanceData = await balanceResponse.json();
        setCreditBalance(balanceData.balance || 0);
        try {
          localStorage.setItem('credit_balance', JSON.stringify(balanceData.balance || 0));
        } catch (e) {
          console.error('Error caching balance:', e);
        }
      }

    } catch (error) {
      console.error('Error loading dashboard data:', error);
      
      // Try to load cached data as fallback
      try {
        const cachedStats = JSON.parse(localStorage.getItem('dashboard_stats') || 'null');
        const cachedItems = JSON.parse(localStorage.getItem('recent_items') || '[]');
        const cachedBalance = JSON.parse(localStorage.getItem('credit_balance') || '0');
        
        if (cachedStats) setStats(cachedStats);
        if (cachedItems) setRecentItems(cachedItems);
        setCreditBalance(cachedBalance);
      } catch (e) {
        console.error('Error loading fallback cached data:', e);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'pending':
        return <Clock className="h-4 w-4 text-orange-600" />;
      case 'failed':
        return <AlertCircle className="h-4 w-4 text-red-600" />;
      default:
        return <Activity className="h-4 w-4 text-gray-600" />;
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'bill':
        return <FileText className="h-4 w-4 text-slate-500" />;
      case 'contract':
        return <Building2 className="h-4 w-4 text-slate-500" />;
      default:
        return <Activity className="h-4 w-4 text-slate-500" />;
    }
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return t('dash.good_morning');
    if (hour < 17) return t('dash.good_afternoon');
    return t('dash.good_evening');
  };

  const initial = (session?.user?.name?.[0] || session?.user?.email?.[0] || 'U').toUpperCase();

  if (isLoading && !stats) {
    return (
      <div className="space-y-4 lg:hidden pb-4">
        {/* Loading Header Skeleton */}
        <div className="flex items-center justify-between mt-2">
          <div className="space-y-1">
            <Skeleton className="h-4 w-24 rounded-lg" />
            <Skeleton className="h-6 w-36 rounded-lg" />
          </div>
          <Skeleton className="h-10 w-10 rounded-full" />
        </div>

        {/* Credit Card Skeleton */}
        <Skeleton className="h-36 w-full rounded-2xl" />

        {/* Quick Actions Skeleton */}
        <div className="grid grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-2xl" />
          ))}
        </div>

        {/* Key Metrics Skeleton */}
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-20 w-full rounded-2xl" />
          <Skeleton className="h-20 w-full rounded-2xl" />
        </div>
        
        {/* Recent Activity Skeleton */}
        <div className="bg-white rounded-2xl border border-slate-100 p-4 space-y-4">
          <Skeleton className="h-6 w-32 rounded-lg" />
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-4 lg:hidden">
      {/* 1. Connection status chip */}
      {!isOnline && (
        <div className="inline-flex items-center gap-2 rounded-full bg-red-50 border border-red-100 px-3 py-1.5 text-xs font-medium text-red-700">
          <WifiOff className="h-3.5 w-3.5 animate-pulse" />
          {t('dash.offline_mode')}
        </div>
      )}

      {/* 2. Greeting header with avatar */}
      <div className="flex items-center justify-between mt-2">
        <div>
          <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">{getGreeting()}</p>
          <h1 className="text-xl font-extrabold text-slate-900 mt-0.5">
            {session?.user?.name || session?.user?.email?.split('@')[0] || (language === 'hi' ? 'उपयोगकर्ता' : 'User')}
          </h1>
        </div>
        <div className="h-10 w-10 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-sm shadow-sm ring-2 ring-emerald-100">
          {initial}
        </div>
      </div>

      {/* 3. Credit balance gradient card */}
      <div className="rounded-2xl bg-gradient-to-br from-emerald-600 to-emerald-700 p-5 text-white shadow-lg shadow-emerald-200">
        <p className="text-xs text-emerald-100 font-semibold tracking-wide">{t('dash.available_credits')}</p>
        <p className="text-3xl font-extrabold mt-1">₹{creditBalance.toLocaleString('en-IN')}</p>
        <div className="flex gap-3 mt-4">
          <Button size="sm" variant="secondary" className="flex-1 bg-white/20 text-white hover:bg-white/30 border-0 rounded-xl h-9 text-xs font-semibold" asChild>
            <Link href="/billing">{t('dash.top_up')}</Link>
          </Button>
          <Button size="sm" variant="outline" className="flex-1 border-white/30 text-white hover:bg-white/10 bg-transparent rounded-xl h-9 text-xs font-semibold" asChild>
            <Link href="/profile">{t('dash.history')}</Link>
          </Button>
        </div>
      </div>

      {/* 4. Quick actions grid */}
      <div className="grid grid-cols-4 gap-3">
        <QuickAction icon={Plus} label={t('dash.new_bill')} href="/bills/new" />
        <QuickAction icon={Building2} label={t('dash.contract')} href="/contracts/new" />
        <QuickAction icon={BarChart3} label={t('dash.reports')} href="/reports/abstract" />
        <QuickAction icon={BarChart3} label={t('dash.forecast')} href="/tendering-estimator" />
      </div>

      {/* Tendering Estimator Promotion Banner */}
      <Card className="rounded-2xl border-emerald-100 bg-gradient-to-r from-emerald-50/50 to-emerald-50/30 p-4 shadow-sm relative overflow-hidden group hover:border-emerald-200 transition-colors">
        <div className="absolute top-0 right-0 bg-emerald-600 text-[9px] text-white font-extrabold px-2.5 py-0.5 rounded-bl-xl tracking-wider uppercase">
          New
        </div>
        <div className="flex items-start gap-3.5">
          <div className="p-3 bg-emerald-50 border border-emerald-100 text-emerald-600 rounded-xl shrink-0">
            <BarChart3 className="h-5 w-5" />
          </div>
          <div className="space-y-1">
            <h4 className="font-extrabold text-slate-800 text-sm flex items-center gap-1.5">
              Tendering PVC Estimator
            </h4>
            <p className="text-xs text-slate-500 font-light leading-relaxed">
              Calculate projected escalations & loading margins for new railway tenders.
            </p>
            <Link href="/tendering-estimator" className="inline-flex items-center text-xs font-bold text-emerald-600 hover:text-emerald-700 mt-1">
              Start simulation
              <ChevronRight className="h-3.5 w-3.5 ml-0.5" />
            </Link>
          </div>
        </div>
      </Card>

      {/* 5. Key metrics */}
      <div className="grid grid-cols-2 gap-3">
        <MetricCard value={stats?.totalContracts ?? 0} label={t('dash.active_contracts')} />
        <MetricCard value={stats?.totalBills ?? 0} label={t('dash.bills_generated')} />
      </div>

      {/* 6. Recent activity list */}
      <Card className="rounded-2xl shadow-sm border-slate-100 bg-white">
        <CardHeader className="pb-3 pt-4 px-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-bold flex items-center text-slate-800">
              <Activity className="h-4.5 w-4.5 mr-2 text-emerald-600" />
              {t('dash.recent_activity')}
            </CardTitle>
            <Button variant="ghost" size="sm" className="text-xs text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50/50 h-7 px-2 rounded-lg" asChild>
              <Link href="/activity">{t('dash.view_all')}</Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 px-4 pb-4">
          {recentItems.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <Activity className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-xs">{t('dash.no_recent_activity')}</p>
            </div>
          ) : (
            recentItems.map((item) => (
              <Link
                href={item.type === 'bill' ? `/bills/${item.id}` : item.type === 'contract' ? `/contracts/${item.id}` : '#'}
                key={item.id}
                className="flex items-center space-x-3 p-3 rounded-xl border border-slate-50 hover:bg-slate-50/50 transition-colors"
              >
                <div className="flex-shrink-0">
                  <div className="p-2 rounded-xl bg-slate-50 text-slate-600">
                    {getTypeIcon(item.type)}
                  </div>
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-slate-800 truncate">
                      {item.title}
                    </p>
                    {getStatusIcon(item.status)}
                  </div>
                  
                  <div className="flex items-center justify-between mt-0.5">
                    <p className="text-[10px] text-slate-500 truncate">
                      {item.subtitle}
                    </p>
                    <p className="text-[10px] text-slate-400">
                      {format(toISTDate(new Date(item.timestamp)), 'MMM d')}
                    </p>
                  </div>
                  
                  {item.amount && (
                    <p className="text-xs font-bold text-green-600 mt-1">
                      ₹{item.amount.toLocaleString('en-IN')}
                    </p>
                  )}
                </div>
                
                <ChevronRight className="h-4 w-4 text-slate-400 flex-shrink-0" />
              </Link>
            ))
          )}

          {recentItems.length > 0 && (
            <Button variant="outline" size="sm" className="w-full rounded-xl border-slate-100 hover:bg-slate-50 text-slate-700 text-xs font-semibold h-9" asChild>
              <Link href="/activity">
                {t('dash.view_all_activity')}
              </Link>
            </Button>
          )}
        </CardContent>
      </Card>

      {/* 7. Admin panel link */}
      {isAdmin && (
        <Card className="rounded-2xl border-slate-100 shadow-sm overflow-hidden">
          <CardContent className="p-0">
            <Button asChild variant="ghost" className="w-full justify-between h-12 px-4 rounded-none hover:bg-slate-50 text-slate-700 text-xs font-bold">
              <Link href="/admin" className="flex items-center">
                <Building2 className="h-4 w-4 mr-2 text-emerald-600" />
                {t('dash.admin_panel')}
                <ChevronRight className="h-4 w-4 ml-auto text-slate-400" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
