
'use client';

import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { RazorpayTopupDialog } from '@/components/ui/razorpay-topup-dialog';
import { getClientRoleInfo } from '@/lib/role-auth';
import { 
  Building2,
  Calculator,
  FileText, 
  Menu, 
  X,
  Home,
  Settings,
  LogOut,
  User,
  ChevronDown,
  Shield,
  CreditCard,
  Layers,
  Briefcase,
  Tags,
  LineChart,
  ShieldCheck,
  Wrench,
  FileBarChart,
  CheckSquare,
  Receipt,
  Wallet,
  Plus,
  AlertCircle,
  MessageSquare,
  TrendingUp
} from 'lucide-react';
import { cn } from '@/lib/utils';


// Standalone navigation items (top-level tabs)
const standaloneNavItems = [
  { name: 'Price Indices', href: '/indices/view', icon: LineChart, adminOnly: false }
];

const navigationGroups = [
  {
    name: 'Contract Management',
    icon: Building2,
    items: [
      // Admin-only operations
      { name: 'Dashboard', href: '/dashboard', icon: Home, adminOnly: true },
      { name: 'Contracts', href: '/contracts', icon: Briefcase, adminOnly: false },
      { name: 'PVC Bills', href: '/bills', icon: FileText, adminOnly: false },
      { name: 'Bill Approvals', href: '/approvals', icon: CheckSquare, railwayOfficialOnly: true },
      { name: 'Abstract of Bills', href: '/reports/abstract', icon: Calculator, adminOnly: false },
      { name: 'Steel PVC Forecast', href: '/pvc-forecast', icon: TrendingUp, adminOnly: false },
    ]
  },
  {
    name: 'Admin Settings',
    icon: Settings,
    items: [
      { name: 'PVC Check Analytics', href: '/admin/analytics', icon: TrendingUp, adminOnly: true },
      { name: 'Report Templates', href: '/report-templates', icon: Layers, adminOnly: true },
      { name: 'Work Classifications', href: '/classifications', icon: Tags, adminOnly: true },
      { name: 'Extension Categories', href: '/admin/extension-subcategories', icon: FileBarChart, adminOnly: true },
      { name: 'Price Indices Management', href: '/indices', icon: LineChart, adminOnly: true },
      { name: 'Component Index Documents', href: '/indices/component-documents', icon: FileText, adminOnly: true },
      { name: 'GST Invoices', href: '/admin/gst-invoices', icon: Receipt, adminOnly: true },
      { name: 'User Management', href: '/admin/users', icon: User, adminOnly: true },
      { name: 'Role & Permissions', href: '/admin/user-permissions', icon: ShieldCheck, adminOnly: true },
      { name: 'WhatsApp Logs', href: '/admin/whatsapp-logs', icon: MessageSquare, adminOnly: true },
    ]
  }
];

interface CreditBalance {
  balance: number;
  isPaidUser: boolean; // Whether user has ever topped up credits
  trialInfo: {
    isActive: boolean;
    billsRemaining: number;
  };
}

interface BillingSettings {
  billCost: number;
  paymentEnabled: boolean;
}

export default function Navigation() {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const [isOpen, setIsOpen] = useState(false);
  const [showTopupDialog, setShowTopupDialog] = useState(false);
  const [creditData, setCreditData] = useState<CreditBalance | null>(null);
  const [billingSettings, setBillingSettings] = useState<BillingSettings | null>(null);

  // Get user role information
  const { isAdmin, isRailwayOfficial, role } = getClientRoleInfo(session);

  // Fetch credit balance + billing settings in a single parallel round-trip
  useEffect(() => {
    if (status !== 'authenticated') return;

    const fetchNavData = async () => {
      try {
        const [balanceRes, settingsRes] = await Promise.all([
          fetch('/api/credits/balance'),
          fetch('/api/settings/billing'),
        ]);
        if (balanceRes.ok) setCreditData(await balanceRes.json());
        if (settingsRes.ok) setBillingSettings(await settingsRes.json());
      } catch (err) {
        console.error('Failed to fetch nav data:', err);
      }
    };

    fetchNavData();
    // Refresh every 60s instead of 30s — halves the polling load
    const interval = setInterval(fetchNavData, 60000);
    return () => clearInterval(interval);
  }, [status]);

  // Check if user has insufficient balance
  const hasInsufficientBalance = useMemo(() => {
    if (!creditData || !billingSettings || isAdmin) return false;
    
    // If in trial, no warning needed
    if (creditData.trialInfo.isActive && creditData.trialInfo.billsRemaining > 0) {
      return false;
    }
    
    // If payment is disabled, no warning needed
    if (!billingSettings.paymentEnabled) {
      return false;
    }
    
    // Check if balance is less than bill cost
    return creditData.balance < billingSettings.billCost;
  }, [creditData, billingSettings, isAdmin]);

  // Check if user is on auth pages (signin/signup) or landing page
  const isOnAuthPage = pathname?.startsWith('/auth/signin') || pathname?.startsWith('/auth/signup');
  const isOnLandingPage = pathname === '/';
  
  // Get role display label
  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'admin':
        return 'Admin';
      case 'pending_railway_official':
        return 'Pending Official';
      case 'railway_official':
        return 'Railway Official';
      case 'contractor':
        return 'Contractor';
      default:
        return 'Contractor'; // Default to Contractor
    }
  };
  
  // Filter standalone navigation items based on user role
  const filteredStandaloneItems = useMemo(() => {
    return standaloneNavItems.filter(item => {
      // Admin-only items
      if ((item as any).adminOnly && !isAdmin) return false;
      // Railway official-only items
      if ((item as any).railwayOfficialOnly && !isRailwayOfficial) return false;
      return true;
    });
  }, [isAdmin, isRailwayOfficial]);

  // Filter navigation groups and items based on user role
  const filteredNavGroups = useMemo(() => {
    return navigationGroups.map(group => ({
      ...group,
      items: group.items.filter(item => {
        // Admin-only items
        if (item.adminOnly && !isAdmin) return false;
        // Railway official-only items
        if ((item as any).railwayOfficialOnly && !isRailwayOfficial) return false;
        return true;
      })
    })).filter(group => group.items.length > 0);
  }, [isAdmin, isRailwayOfficial]);

  // Helper function to check if current path is in group
  const isGroupActive = (group: typeof navigationGroups[0]) => {
    return group.items.some(item => pathname === item.href);
  };

  const handleSignOut = async () => {
    try {
      await signOut({ 
        callbackUrl: '/auth/signin',
        redirect: true 
      });
    } catch (error) {
      console.error('Sign out error:', error);
      // Force redirect to sign in page even if sign out fails
      window.location.href = '/auth/signin';
    }
  };

  return (
    <nav className="sticky top-0 z-50 bg-white shadow-sm border-b border-gray-200">
      <div className="container mx-auto px-2 sm:px-4 max-w-7xl">
        <div className="flex justify-between items-center h-16">
          {/* Brand */}
          <Link href="/contracts" className="flex items-center space-x-2 sm:space-x-3 group">
            <div className="flex flex-col">
              <span className="text-lg sm:text-xl font-bold text-blue-600 hidden sm:block leading-tight tracking-tight">
                IR-PVC
              </span>

              <span className="text-sm font-bold text-blue-600 block sm:hidden">
                IR-PVC
              </span>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-1">
            {session ? (
              <>
                {/* Standalone Navigation Items */}
                {filteredStandaloneItems.map((item) => {
                  const isActive = pathname === item.href;
                  const ItemIcon = item.icon;
                  return (
                    <Button
                      key={item.name}
                      asChild
                      variant={isActive ? "secondary" : "ghost"}
                      size="sm"
                      className={cn(
                        "flex items-center space-x-2 text-gray-700 hover:bg-gray-100 transition-all duration-200",
                        isActive && "bg-blue-50 text-blue-700 hover:bg-blue-100 font-semibold"
                      )}
                    >
                      <Link href={item.href}>
                        <ItemIcon className="h-4 w-4" />
                        <span>{item.name}</span>
                      </Link>
                    </Button>
                  );
                })}

                {/* Navigation Groups */}
                {filteredNavGroups.map((group) => {
                  const groupActive = isGroupActive(group);
                  const GroupIcon = group.icon;
                  
                  return (
                    <DropdownMenu key={group.name}>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant={groupActive ? "secondary" : "ghost"}
                          size="sm"
                          className={cn(
                            "flex items-center space-x-2 text-gray-700 hover:bg-gray-100 transition-all duration-200",
                            groupActive && "bg-blue-50 text-blue-700 hover:bg-blue-100 font-semibold"
                          )}
                        >
                          <GroupIcon className="h-4 w-4" />
                          <span>{group.name}</span>
                          <ChevronDown className="h-3 w-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-48 bg-white/95 backdrop-blur-sm">
                        {group.items.map((item) => {
                          const isActive = pathname === item.href;
                          const ItemIcon = item.icon;
                          return (
                            <DropdownMenuItem key={item.name} asChild>
                              <Link 
                                href={item.href}
                                className={cn(
                                  "flex items-center space-x-2 w-full px-2 py-2 cursor-pointer",
                                  isActive && "bg-blue-50 text-blue-700 font-medium"
                                )}
                              >
                                <ItemIcon className="h-4 w-4" />
                                <span>{item.name}</span>
                              </Link>
                            </DropdownMenuItem>
                          );
                        })}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  );
                })}
                
                {/* Credit Balance & Top-up - Show for all authenticated users */}
                {creditData && (
                  <div className="flex items-center space-x-2 ml-2 pl-2 border-l border-gray-200">
                    {/* Credit Balance Display */}
                    <div className="flex items-center space-x-2 px-3 py-1.5 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors">
                      <Wallet className="h-4 w-4 text-gray-600" />
                      <div className="flex flex-col">
                        {creditData.trialInfo.isActive ? (
                          <>
                            <span className="text-xs font-semibold text-gray-800 leading-tight">
                              {creditData.trialInfo.billsRemaining} Free Bill{creditData.trialInfo.billsRemaining !== 1 ? 's' : ''}
                            </span>
                            <span className="text-xs text-gray-500 leading-tight">Trial Active</span>
                          </>
                        ) : (
                          <>
                            <span className={cn(
                              "text-xs font-semibold leading-tight",
                              hasInsufficientBalance ? "text-red-600" : "text-gray-800"
                            )}>
                              ₹{creditData.balance.toFixed(2)}
                            </span>
                            <span className="text-xs text-gray-500 leading-tight">Balance</span>
                          </>
                        )}
                      </div>
                      {/* Insufficient Balance Warning Badge */}
                      {hasInsufficientBalance && (
                        <div className="ml-1">
                          <AlertCircle className="h-4 w-4 text-red-500 animate-pulse" />
                        </div>
                      )}
                    </div>

                    {/* Insufficient Balance Warning Tooltip */}
                    {hasInsufficientBalance && (
                      <div className="hidden xl:flex items-center px-2 py-1 bg-red-50 border border-red-200 rounded-md">
                        <AlertCircle className="h-3 w-3 text-red-500 mr-1.5" />
                        <span className="text-xs text-red-600 font-medium whitespace-nowrap">
                          Low balance
                        </span>
                      </div>
                    )}

                    {/* Top-up Button */}
                    <Button
                      onClick={() => setShowTopupDialog(true)}
                      size="sm"
                      className={cn(
                        "shadow-sm",
                        hasInsufficientBalance
                          ? "bg-red-500 text-white hover:bg-red-600 animate-pulse"
                          : "bg-blue-600 text-white hover:bg-blue-700"
                      )}
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Top-up
                    </Button>
                  </div>
                )}
                
                {/* User Menu */}
                <div className="flex items-center ml-2 pl-2 border-l border-gray-200">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="flex items-center space-x-2 text-gray-700 hover:bg-gray-100">
                        <div className="bg-gray-100 p-1.5 rounded-full">
                          <User className="h-4 w-4 text-gray-600" />
                        </div>
                        <div className="flex flex-col items-start">
                          <span className="text-sm text-gray-800 font-medium">
                            {session.user?.name || session.user?.email}
                          </span>
                          <span className="text-xs text-gray-500 font-medium">
                            {getRoleLabel(role)}
                          </span>
                        </div>
                        <ChevronDown className="h-4 w-4 text-gray-500" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56 bg-white/95 backdrop-blur-sm">
                      <DropdownMenuItem asChild>
                        <Link href="/profile" className="flex items-center cursor-pointer">
                          <User className="mr-2 h-4 w-4" />
                          <span>Profile & Settings</span>
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link href="/billing" className="flex items-center cursor-pointer">
                          <CreditCard className="mr-2 h-4 w-4" />
                          <span>Billing</span>
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        onClick={handleSignOut}
                        className="text-red-600 hover:text-red-700 focus:text-red-700 cursor-pointer"
                      >
                        <LogOut className="mr-2 h-4 w-4" />
                        <span>Sign Out</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </>
            ) : !isOnAuthPage ? (
              <div className="flex items-center space-x-2">
                <Button asChild variant="ghost" size="sm" className="text-gray-700 hover:bg-gray-100">
                  <Link href="/auth/signin">Sign In</Link>
                </Button>
                <Button asChild size="sm" className="bg-blue-600 text-white hover:bg-blue-700">
                  <Link href="/auth/signup">Sign Up</Link>
                </Button>
              </div>
            ) : null}
          </div>

          {/* Mobile menu button */}
          <Button
            variant="ghost"
            size="sm"
            className="md:hidden text-gray-700 hover:bg-gray-100"
            onClick={() => setIsOpen(!isOpen)}
          >
            {isOpen ? <X className="h-5 w-5 sm:h-6 sm:w-6" /> : <Menu className="h-5 w-5 sm:h-6 sm:w-6" />}
          </Button>
        </div>

        {/* Mobile Navigation */}
        {isOpen && (
          <div className="md:hidden py-4 border-t border-gray-200 bg-white rounded-b-lg">
            <div className="flex flex-col space-y-2">
              {session ? (
                <>
                  {/* User Info */}
                  <div className="px-4 py-2 bg-gray-100 rounded-lg mb-2">
                    <div className="flex items-center space-x-2">
                      <div className="bg-gray-200 p-1.5 rounded-full">
                        <User className="h-4 w-4 text-gray-600" />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm text-gray-800 font-medium">
                          {session.user?.name || session.user?.email}
                        </span>
                        <span className="text-xs text-gray-500 font-medium">
                          {getRoleLabel(role)}
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  {/* Credit Balance & Top-up - Mobile - Show for all authenticated users */}
                  {creditData && (
                    <div className="px-4 py-3 bg-gray-100 rounded-lg mb-3 space-y-2">
                      {/* Balance Display */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <Wallet className="h-4 w-4 text-gray-600" />
                          <span className="text-xs text-gray-500 font-medium">
                            {creditData.trialInfo.isActive ? 'Trial Balance' : 'Credit Balance'}
                          </span>
                        </div>
                        <div className="flex items-center space-x-1.5">
                          {creditData.trialInfo.isActive ? (
                            <span className="text-sm font-bold text-gray-800">
                              {creditData.trialInfo.billsRemaining} Free Bill{creditData.trialInfo.billsRemaining !== 1 ? 's' : ''}
                            </span>
                          ) : (
                            <span className={cn(
                              "text-sm font-bold",
                              hasInsufficientBalance ? "text-red-600" : "text-gray-800"
                            )}>
                              ₹{creditData.balance.toFixed(2)}
                            </span>
                          )}
                          {hasInsufficientBalance && (
                            <AlertCircle className="h-4 w-4 text-red-500 animate-pulse" />
                          )}
                        </div>
                      </div>

                      {hasInsufficientBalance && (
                        <div className="flex items-start space-x-2 p-2 bg-red-50 border border-red-200 rounded-md">
                          <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
                          <p className="text-xs text-red-600 font-medium">
                            You can't create the bill with insufficient balance
                          </p>
                        </div>
                      )}

                      <Button
                        onClick={() => { setShowTopupDialog(true); setIsOpen(false); }}
                        size="sm"
                        className={cn(
                          "w-full shadow-sm",
                          hasInsufficientBalance
                            ? "bg-red-500 text-white hover:bg-red-600 animate-pulse"
                            : "bg-blue-600 text-white hover:bg-blue-700"
                        )}
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Top-up Credits
                      </Button>
                    </div>
                  )}
                  
                  {/* Standalone Navigation Items */}
                  {filteredStandaloneItems.length > 0 && (
                    <div className="space-y-1 mb-2">
                      {filteredStandaloneItems.map((item) => {
                        const isActive = pathname === item.href;
                        const ItemIcon = item.icon;
                        return (
                          <Button
                            key={item.name}
                            asChild
                            variant={isActive ? "secondary" : "ghost"}
                            size="sm"
                            className={cn(
                              "w-full justify-start flex items-center space-x-2 text-gray-700 hover:bg-gray-100",
                              isActive && "bg-blue-50 text-blue-700 hover:bg-blue-100 font-semibold"
                            )}
                            onClick={() => setIsOpen(false)}
                          >
                            <Link href={item.href}>
                              <ItemIcon className="h-4 w-4" />
                              <span>{item.name}</span>
                            </Link>
                          </Button>
                        );
                      })}
                    </div>
                  )}

                  {/* Navigation Groups */}
                  {filteredNavGroups.map((group) => {
                    const GroupIcon = group.icon;
                    return (
                      <div key={group.name} className="space-y-1">
                        {/* Group Header */}
                        <div className="flex items-center space-x-2 px-2 py-1 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                          <GroupIcon className="h-3 w-3" />
                          <span>{group.name}</span>
                        </div>
                        
                        {/* Group Items */}
                        {group.items.map((item) => {
                          const isActive = pathname === item.href;
                          const ItemIcon = item.icon;
                          return (
                            <Button
                              key={item.name}
                              asChild
                              variant={isActive ? "secondary" : "ghost"}
                              size="sm"
                              className={cn(
                                "w-full justify-start flex items-center space-x-2 ml-4 text-gray-700 hover:bg-gray-100",
                                isActive && "bg-blue-50 text-blue-700 hover:bg-blue-100 font-semibold"
                              )}
                              onClick={() => setIsOpen(false)}
                            >
                              <Link href={item.href}>
                                <ItemIcon className="h-4 w-4" />
                                <span>{item.name}</span>
                              </Link>
                            </Button>
                          );
                        })}
                      </div>
                    );
                  })}
                  
                  {/* User Menu Actions */}
                  <div className="pt-2 border-t border-gray-200 mt-2 space-y-1">
                    <Button
                      asChild
                      variant="ghost"
                      size="sm"
                      className="w-full justify-start text-gray-700 hover:bg-gray-100"
                    >
                      <Link href="/profile" onClick={() => setIsOpen(false)}>
                        <User className="h-4 w-4" />
                        <span className="ml-2">Profile & Settings</span>
                      </Link>
                    </Button>
                    <Button
                      asChild
                      variant="ghost"
                      size="sm"
                      className="w-full justify-start text-gray-700 hover:bg-gray-100"
                    >
                      <Link href="/billing" onClick={() => setIsOpen(false)}>
                        <CreditCard className="h-4 w-4" />
                        <span className="ml-2">Billing</span>
                      </Link>
                    </Button>
                    <Button
                      onClick={() => {
                        handleSignOut();
                        setIsOpen(false);
                      }}
                      variant="ghost"
                      size="sm"
                      className="w-full justify-start text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      <LogOut className="h-4 w-4" />
                      <span className="ml-2">Sign Out</span>
                    </Button>
                  </div>
                </>
              ) : !isOnAuthPage ? (
                <div className="flex flex-col space-y-2">
                  <Button asChild variant="ghost" size="sm" className="text-gray-700 hover:bg-gray-100" onClick={() => setIsOpen(false)}>
                    <Link href="/auth/signin">Sign In</Link>
                  </Button>
                  <Button asChild size="sm" className="bg-blue-600 text-white hover:bg-blue-700" onClick={() => setIsOpen(false)}>
                    <Link href="/auth/signup">Sign Up</Link>
                  </Button>
                </div>
              ) : null}
            </div>
          </div>
        )}
      </div>

      {/* Razorpay Top-up Dialog */}
      <RazorpayTopupDialog
        open={showTopupDialog}
        onOpenChange={setShowTopupDialog}
        onSuccess={() => {
          // Refresh credit balance after successful top-up
          fetch('/api/credits/balance')
            .then(res => res.json())
            .then(data => setCreditData(data))
            .catch(err => console.error('Failed to refresh balance:', err));
        }}
      />
    </nav>
  );
}
