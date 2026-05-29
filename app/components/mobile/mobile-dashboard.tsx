
'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Building2, 
  FileText, 
  Calculator, 
  TrendingUp, 
  AlertCircle,
  CheckCircle,
  Clock,
  DollarSign,
  Activity,
  ChevronRight,
  Zap,
  Wifi,
  WifiOff
} from 'lucide-react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { getClientRoleInfo } from '@/lib/role-auth';
import QuickActions from './quick-actions';
// Removed direct PWA import to prevent issues
import { format } from 'date-fns';
import { toISTDate } from '@/lib/ist-utils';

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

export default function MobileDashboard() {
  const { data: session } = useSession();
  const { isAdmin } = getClientRoleInfo(session);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentItems, setRecentItems] = useState<RecentItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(true);

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
          
          if (cachedStats) setStats(cachedStats);
          if (cachedItems) setRecentItems(cachedItems);
          
          if (cachedStats && cachedItems) {
            setIsLoading(false);
            return;
          }
        } catch (e) {
          console.error('Error loading cached data:', e);
        }
      }

      // Load dashboard stats
      const [statsResponse, itemsResponse] = await Promise.all([
        fetch('/api/dashboard/stats'),
        fetch('/api/dashboard/recent')
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

    } catch (error) {
      console.error('Error loading dashboard data:', error);
      
      // Try to load cached data as fallback
      try {
        const cachedStats = JSON.parse(localStorage.getItem('dashboard_stats') || 'null');
        const cachedItems = JSON.parse(localStorage.getItem('recent_items') || '[]');
        
        if (cachedStats) setStats(cachedStats);
        if (cachedItems) setRecentItems(cachedItems);
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
        return <FileText className="h-4 w-4" />;
      case 'contract':
        return <Building2 className="h-4 w-4" />;
      case 'payment':
        return <DollarSign className="h-4 w-4" />;
      default:
        return <Activity className="h-4 w-4" />;
    }
  };

  if (isLoading && !stats) {
    return (
      <div className="space-y-4">
        {/* Connection Status */}
        <Card className="p-3">
          <div className="flex items-center space-x-2">
            {isOnline ? (
              <Wifi className="h-4 w-4 text-green-600" />
            ) : (
              <WifiOff className="h-4 w-4 text-red-600" />
            )}
            <span className="text-sm font-medium">
              {isOnline ? 'Connected' : 'Offline Mode'}
            </span>
            {!isOnline && (
              <Badge variant="outline" className="text-xs">
                Limited
              </Badge>
            )}
          </div>
        </Card>

        {/* Loading Skeleton */}
        <div className="grid grid-cols-2 gap-3">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="p-3">
              <Skeleton className="h-16 w-full" />
            </Card>
          ))}
        </div>
        
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-32" />
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-4">
      {/* Connection Status */}
      <Card className="p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            {isOnline ? (
              <Wifi className="h-4 w-4 text-green-600" />
            ) : (
              <WifiOff className="h-4 w-4 text-red-600" />
            )}
            <span className="text-sm font-medium">
              {isOnline ? 'Connected' : 'Offline Mode'}
            </span>
            {!isOnline && (
              <Badge variant="outline" className="text-xs">
                Limited
              </Badge>
            )}
          </div>
          
          <div className="text-xs text-gray-500">
            Last updated: {typeof window !== 'undefined' ? format(toISTDate(new Date()), 'HH:mm') : '--:--'}
          </div>
        </div>
      </Card>

      {/* Welcome Message */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                Welcome back{session?.user?.name ? `, ${session.user.name}` : ''}!
              </h2>
              <p className="text-sm text-gray-600">
                {isAdmin ? 'Admin Dashboard' : 'Your dashboard overview'}
              </p>
            </div>
            <div className="p-2 bg-purple-100 rounded-full">
              <Zap className="h-5 w-5 text-purple-600" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <QuickActions stats={stats || undefined} />

      {/* Key Metrics */}
      {stats && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center">
              <TrendingUp className="h-4 w-4 mr-2" />
              Key Metrics
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-center">
              <div className="p-3 bg-green-50 rounded-lg">
                <div className="text-2xl font-bold text-green-800">
                  ₹{(stats.totalRevenue / 100000).toFixed(1)}L
                </div>
                <div className="text-xs text-green-600">Total Revenue</div>
              </div>
              
              <div className="p-3 bg-blue-50 rounded-lg">
                <div className="text-2xl font-bold text-blue-800">
                  {stats.processingRate}%
                </div>
                <div className="text-xs text-blue-600">Success Rate</div>
              </div>
            </div>

            <div className="flex items-center justify-between p-3 bg-orange-50 rounded-lg">
              <div>
                <div className="text-sm font-medium text-orange-800">
                  This Month
                </div>
                <div className="text-xs text-orange-600">
                  {stats.thisMonthBills} bills processed
                </div>
              </div>
              <div className="text-xl font-bold text-orange-800">
                {stats.thisMonthBills}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Activity */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center">
              <Activity className="h-4 w-4 mr-2" />
              Recent Activity
            </CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/activity" className="text-xs">
                View All
              </Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {recentItems.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No recent activity</p>
            </div>
          ) : (
            recentItems.map((item) => (
              <div
                key={item.id}
                className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-gray-50 transition-colors"
              >
                <div className="flex-shrink-0">
                  <div className="p-1.5 rounded bg-gray-100">
                    {getTypeIcon(item.type)}
                  </div>
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {item.title}
                    </p>
                    {getStatusIcon(item.status)}
                  </div>
                  
                  <div className="flex items-center justify-between mt-1">
                    <p className="text-xs text-gray-500 truncate">
                      {item.subtitle}
                    </p>
                    <p className="text-xs text-gray-500">
                      {format(toISTDate(new Date(item.timestamp)), 'MMM d')}
                    </p>
                  </div>
                  
                  {item.amount && (
                    <p className="text-xs font-medium text-green-600 mt-1">
                      ₹{item.amount.toLocaleString('en-IN')}
                    </p>
                  )}
                </div>
                
                <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
              </div>
            ))
          )}

          {recentItems.length > 0 && (
            <Button variant="outline" size="sm" className="w-full" asChild>
              <Link href="/activity">
                View All Activity
              </Link>
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Admin Panel Link */}
      {isAdmin && (
        <Card>
          <CardContent className="p-4">
            <Button asChild variant="outline" className="w-full">
              <Link href="/admin" className="flex items-center">
                <Building2 className="h-4 w-4 mr-2" />
                Admin Panel
                <ChevronRight className="h-4 w-4 ml-auto" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
