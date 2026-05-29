
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  Building2, 
  Calculator, 
  FileText, 
  TrendingUp, 
  Menu, 
  Home,
  Settings,
  LogOut,
  User,
  Plus,
  CreditCard,
  BarChart3,
  ListChecks,
  UserCircle,
  MessageSquare
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getClientRoleInfo } from '@/lib/role-auth';

const mobileNavSections = [
  {
    title: 'Main',
    items: [
      { name: 'Dashboard', href: '/dashboard', icon: Home, adminOnly: true },
      { name: 'Contracts', href: '/contracts', icon: Building2, adminOnly: false },
      { name: 'Bills', href: '/bills', icon: FileText, adminOnly: false },
      { name: 'Approvals', href: '/approvals', icon: ListChecks, railwayOfficialOnly: true },
    ]
  },
  {
    title: 'Reports & Data',
    items: [
      { name: 'Abstract', href: '/reports/abstract', icon: Calculator, adminOnly: false },
      { name: 'Reports', href: '/reports', icon: BarChart3, adminOnly: false },
      { name: 'Steel PVC Forecast', href: '/pvc-forecast', icon: TrendingUp, adminOnly: false },

      { name: 'Price Indices', href: '/indices', icon: TrendingUp, adminOnly: false },
      { name: 'Classifications', href: '/classifications', icon: ListChecks, adminOnly: true },
      { name: 'Report Templates', href: '/report-templates', icon: FileText, adminOnly: true },
      { name: 'Extension Subcategories', href: '/admin/extension-subcategories', icon: Calculator, adminOnly: true },
    ]
  },
  {
    title: 'Account',
    items: [
      { name: 'Profile', href: '/profile', icon: UserCircle, adminOnly: false },
      { name: 'Billing', href: '/billing', icon: CreditCard, adminOnly: false },
      { name: 'PVC Check Analytics', href: '/admin/analytics', icon: TrendingUp, adminOnly: true },
      { name: 'User Management', href: '/admin/users', icon: User, adminOnly: true },
      { name: 'User Permissions', href: '/admin/user-permissions', icon: Settings, adminOnly: true },
      { name: 'System Settings', href: '/admin/settings', icon: Settings, adminOnly: true },
      { name: 'WhatsApp Logs', href: '/admin/whatsapp-logs', icon: MessageSquare, adminOnly: true },
    ]
  }
];

const quickActions = [
  { name: 'New Bill', href: '/bills/new', icon: FileText, color: 'bg-gradient-to-br from-purple-500 to-purple-600', adminOnly: true },
  { name: 'New Contract', href: '/contracts/new', icon: Building2, color: 'bg-gradient-to-br from-blue-500 to-blue-600', adminOnly: true },
];

export default function MobileNavigation() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [isOpen, setIsOpen] = useState(false);
  
  const { isAdmin, isRailwayOfficial, role } = getClientRoleInfo(session);
  
  // Get role display label
  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'admin':
        return 'Admin';
      case 'railway_official':
        return 'Railway Official';
      case 'contractor':
        return 'Contractor';
      default:
        return 'Contractor'; // Default to Contractor
    }
  };
  
  const filteredQuickActions = quickActions.filter(action => !action.adminOnly || isAdmin);
  const filteredSections = mobileNavSections.map(section => ({
    ...section,
    items: section.items.filter(item => {
      // Admin-only items
      if ((item as any).adminOnly && !isAdmin) return false;
      // Railway official-only items
      if ((item as any).railwayOfficialOnly && !isRailwayOfficial) return false;
      return true;
    })
  })).filter(section => section.items.length > 0);

  const handleSignOut = () => {
    signOut({ callbackUrl: '/auth/signin' });
    setIsOpen(false);
  };

  return (
    <>
      {/* Mobile Navigation Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-sm border-b border-gray-200 shadow-sm">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center space-x-3">
            <Sheet open={isOpen} onOpenChange={setIsOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="sm" className="p-2 hover:bg-purple-50">
                  <Menu className="h-6 w-6 text-gray-700" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[85vw] max-w-sm p-0">
                <div className="flex flex-col h-full">
                  {/* Header */}
                  <SheetHeader className="px-6 py-5 bg-gradient-to-br from-purple-600 to-purple-700 text-white">
                    <SheetTitle className="text-left text-white text-xl font-bold">
                      IR-PVC
                    </SheetTitle>
                    {session?.user && (
                      <div className="flex items-center space-x-3 mt-3 pt-3 border-t border-purple-500">
                        <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                          <span className="text-lg font-medium text-white">
                            {session.user.name?.[0] || session.user.email?.[0] || 'U'}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-white truncate">
                            {session.user.name || 'User'}
                          </div>
                          <div className="text-xs text-purple-200 truncate">
                            {session.user.email}
                          </div>
                          <div className="text-xs text-purple-200 font-medium mt-0.5">
                            {getRoleLabel(role)}
                          </div>
                        </div>
                      </div>
                    )}
                  </SheetHeader>

                  <div className="flex-1 overflow-y-auto py-2">
                    {/* Quick Actions */}
                    {filteredQuickActions.length > 0 && (
                      <div className="px-4 py-3">
                        <div className="grid grid-cols-2 gap-3">
                          {filteredQuickActions.map((action) => (
                            <Link
                              key={action.href}
                              href={action.href}
                              onClick={() => setIsOpen(false)}
                              className="group"
                            >
                              <div className={`flex flex-col items-center justify-center p-4 rounded-xl ${action.color} text-white hover:shadow-lg transition-all duration-200 transform hover:scale-105`}>
                                <action.icon className="h-6 w-6 mb-2" />
                                <span className="text-xs font-medium text-center">
                                  {action.name}
                                </span>
                              </div>
                            </Link>
                          ))}
                        </div>
                      </div>
                    )}

                    {filteredQuickActions.length > 0 && <Separator className="my-2" />}

                    {/* Navigation Sections */}
                    {filteredSections.map((section, idx) => (
                      <div key={section.title} className="px-4 py-3">
                        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 px-3">
                          {section.title}
                        </h3>
                        <div className="space-y-1">
                          {section.items.map((item) => (
                            <Link
                              key={item.href}
                              href={item.href}
                              onClick={() => setIsOpen(false)}
                              className={cn(
                                "flex items-center space-x-3 px-3 py-2.5 rounded-lg transition-all duration-150",
                                pathname === item.href
                                  ? "bg-purple-50 text-purple-700 font-medium"
                                  : "text-gray-700 hover:bg-gray-50 active:bg-gray-100"
                              )}
                            >
                              <item.icon className={cn(
                                "h-5 w-5",
                                pathname === item.href ? "text-purple-600" : "text-gray-500"
                              )} />
                              <span className="flex-1 text-sm">{item.name}</span>
                            </Link>
                          ))}
                        </div>
                        {idx < filteredSections.length - 1 && (
                          <Separator className="mt-3" />
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Footer - Sign Out */}
                  <div className="border-t bg-gray-50 px-4 py-3">
                    <Button
                      onClick={handleSignOut}
                      variant="ghost"
                      className="w-full justify-start text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      <LogOut className="h-4 w-4 mr-3" />
                      Sign Out
                    </Button>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
            
            <Link href="/dashboard" className="flex items-center space-x-2">
              <h1 className="text-lg font-bold bg-gradient-to-r from-purple-600 to-purple-800 bg-clip-text text-transparent">
                IR-PVC
              </h1>
            </Link>
          </div>

          {/* User Avatar */}
          <div className="flex items-center space-x-2">
            {session?.user && (
              <div className="w-9 h-9 bg-gradient-to-br from-purple-500 to-purple-600 rounded-full flex items-center justify-center shadow-sm">
                <span className="text-sm font-semibold text-white">
                  {session.user.name?.[0] || session.user.email?.[0] || 'U'}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Top Spacer */}
      <div className="lg:hidden h-16" />
    </>
  );
}
