
'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Plus, 
  Building2, 
  FileText, 
  Calculator, 
  TrendingUp,
  CreditCard,
  Clock,
  CheckCircle,
  AlertCircle
} from 'lucide-react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { getClientRoleInfo } from '@/lib/role-auth-client';

interface QuickActionsProps {
  stats?: {
    totalContracts: number;
    totalBills: number;
    pendingBills: number;
    recentActivity: number;
  };
}

export default function QuickActions({ stats }: QuickActionsProps) {
  const { data: session } = useSession();
  const { isAdmin } = getClientRoleInfo(session);

  const quickActionItems = [
    {
      name: 'New Contract',
      href: '/contracts/new',
      icon: Building2,
      color: 'bg-emerald-500 hover:bg-emerald-600',
      description: 'Create new contract'
    },
    {
      name: 'New Bill',
      href: '/bills/new',
      icon: FileText,
      color: 'bg-green-500 hover:bg-green-600',
      description: 'Process new bill'
    },
    {
      name: 'Bill Abstracts',
      href: '/reports/abstract',
      icon: Calculator,
      color: 'bg-emerald-500 hover:bg-emerald-600',
      description: 'Generate abstracts'
    },
    {
      name: 'Billing',
      href: '/profile',
      icon: CreditCard,
      color: 'bg-orange-500 hover:bg-orange-600',
      description: 'Billing & payments'
    },
  ];

  const adminActions = [
    {
      name: 'Price Indices',
      href: '/indices',
      icon: TrendingUp,
      color: 'bg-emerald-500 hover:bg-emerald-600',
      description: 'Manage indices'
    },
  ];

  const statCards = [
    {
      title: 'Total Contracts',
      value: stats?.totalContracts || 0,
      icon: Building2,
      color: 'text-emerald-600 bg-emerald-100',
    },
    {
      title: 'Total Bills',
      value: stats?.totalBills || 0,
      icon: FileText,
      color: 'text-green-600 bg-green-100',
    },
    {
      title: 'Pending',
      value: stats?.pendingBills || 0,
      icon: Clock,
      color: 'text-orange-600 bg-orange-100',
    },
    {
      title: 'Recent Activity',
      value: stats?.recentActivity || 0,
      icon: CheckCircle,
      color: 'text-emerald-600 bg-emerald-100',
    },
  ];

  const allActions = isAdmin ? [...quickActionItems, ...adminActions] : quickActionItems;

  return (
    <div className="space-y-4">
      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 gap-3">
          {statCards.map((stat) => (
            <Card key={stat.title} className="p-3">
              <CardContent className="p-0">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-600 mb-1">{stat.title}</p>
                    <p className="text-lg font-bold">{stat.value}</p>
                  </div>
                  <div className={`p-2 rounded-full ${stat.color}`}>
                    <stat.icon className="h-4 w-4" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Quick Actions */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3">
          {allActions.map((action) => (
            <Button
              key={action.name}
              asChild
              variant="outline"
              className="h-auto p-4 flex-col space-y-2 touch-manipulation"
            >
              <Link href={action.href}>
                <div className={`p-2 rounded-full text-white ${action.color} transition-colors`}>
                  <action.icon className="h-5 w-5" />
                </div>
                <div className="text-center">
                  <div className="font-medium text-xs">{action.name}</div>
                  <div className="text-xs text-gray-500">{action.description}</div>
                </div>
              </Link>
            </Button>
          ))}
        </CardContent>
      </Card>

      {/* Recent Activity */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center">
            <Clock className="h-4 w-4 mr-2" />
            Recent Activity
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center space-x-3 p-2 border rounded-lg">
            <div className="p-1.5 rounded bg-green-100">
              <CheckCircle className="h-3 w-3 text-green-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">Bill B-2024-001 processed</p>
              <p className="text-xs text-gray-500">2 hours ago</p>
            </div>
          </div>

          <div className="flex items-center space-x-3 p-2 border rounded-lg">
            <div className="p-1.5 rounded bg-emerald-100">
              <Building2 className="h-3 w-3 text-emerald-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">New contract created</p>
              <p className="text-xs text-gray-500">1 day ago</p>
            </div>
          </div>

          <div className="flex items-center space-x-3 p-2 border rounded-lg">
            <div className="p-1.5 rounded bg-orange-100">
              <AlertCircle className="h-3 w-3 text-orange-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">Payment pending verification</p>
              <p className="text-xs text-gray-500">2 days ago</p>
            </div>
          </div>

          <Button variant="outline" size="sm" className="w-full">
            View All Activity
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
