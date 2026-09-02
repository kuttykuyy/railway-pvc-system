
'use client';

import { useState, useMemo, useEffect, Fragment } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { signOutToCurrentSite } from '@/lib/sign-out';
import { Button } from '@/components/ui/button';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { RazorpayTopupDialog } from '@/components/ui/razorpay-topup-dialog';
import { ThemeToggle } from '@/components/theme-toggle';
import { getClientRoleInfo } from '@/lib/role-auth-client';
import { useLanguage } from './i18n-provider';
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
  Package,
  LineChart,
  ShieldCheck,
  Wrench,
  FileBarChart,
  CheckSquare,
  Receipt,
  Wallet,
  Plus,
  AlertCircle,
  Database,
  MessageSquare,
  TrendingUp,
  BarChart3,
  Gift,
  Sparkles,
  Send
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { WORK_ITEMS, ADMIN_ITEMS, REFERENCE_ITEMS } from '@/lib/navigation-items';


// The screens themselves live in lib/navigation-items.ts, shared with the phone menu —
// two hand-kept lists had drifted nine entries apart. Only the grouping is local.
const standaloneNavItems = REFERENCE_ITEMS;

const navigationGroups = [
  { name: 'Contract Management', icon: Building2, items: WORK_ITEMS },
  { name: 'Admin Settings', icon: Settings, items: ADMIN_ITEMS },
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

  const { language, setLanguage, t } = useLanguage();

  const getNavTranslationKey = (name: string): string => {
    switch (name) {
      case 'Contract Management': return 'nav.contract_management';
      case 'Admin Settings': return 'nav.admin_settings';
      case 'Dashboard': return 'nav.dashboard';
      case 'Contracts': return 'nav.contracts';
      case 'PVC Bills': return 'nav.bills';
      case 'Bill Approvals': return 'nav.approvals';
      case 'Abstract of Bills': return 'nav.abstract';
      case 'Steel PVC Forecast': return 'nav.forecast';
      case 'Refer & Earn': return '';
      case 'Price Indices': return 'nav.price_indices';
      case 'PVC Check Analytics': return 'nav.analytics';
      case 'Report Templates': return 'nav.templates';
      case 'Work Classifications': return 'nav.classifications';
      case 'Extension Categories': return 'nav.extensions';
      case 'Price Indices Management': return 'nav.indices_manage';
      case 'Component Index Documents': return 'nav.component_docs';
      case 'GST Invoices': return 'nav.gst_invoices';
      case 'User Management': return 'nav.users';
      case 'Role & Permissions': return 'nav.permissions';
      case 'Railway Official Limits': return 'nav.railway_limits';
      case 'WhatsApp Logs': return 'nav.whatsapp_logs';
      case 'Profile': return 'nav.profile';
      case 'Profile & Settings': return 'nav.profile_billing';
      case 'Profile & Billing': return 'nav.profile_billing';
      case 'Sign Out': return 'nav.sign_out';
      case 'Top-up': return 'nav.topup';
      default: return '';
    }
  };

  const translateNav = (name: string) => {
    const key = getNavTranslationKey(name);
    return key ? t(key) : name;
  };

  // Get user role information
  const { isAdmin, isRailwayOfficial, isAccountsOfficial, role } = getClientRoleInfo(session);

  // Fetch credit balance and static billing settings
  useEffect(() => {
    if (status !== 'authenticated') return;

    const fetchStaticBillingSettings = async () => {
      try {
        const settingsRes = await fetch('/api/settings/billing');
        if (settingsRes.ok) setBillingSettings(await settingsRes.json());
      } catch (err) {
        console.error('Failed to fetch static billing settings:', err);
      }
    };

    const fetchBalance = async () => {
      try {
        const balanceRes = await fetch('/api/credits/balance');
        if (balanceRes.ok) setCreditData(await balanceRes.json());
      } catch (err) {
        console.error('Failed to fetch credit balance:', err);
      }
    };

    // Load static settings and initial balance
    fetchStaticBillingSettings();
    fetchBalance();

    // Poll only credit balance every 60 seconds
    const interval = setInterval(fetchBalance, 60000);
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
      if ((item as any).accountsOfficialOnly && !isAccountsOfficial) return false;
      return true;
    });
  }, [isAdmin, isRailwayOfficial, isAccountsOfficial]);

  // Filter navigation groups and items based on user role
  const filteredNavGroups = useMemo(() => {
    return navigationGroups.map(group => ({
      ...group,
      items: group.items.filter(item => {
        // Admin-only items
        if (item.adminOnly && !isAdmin) return false;
        // Railway official-only items
        if ((item as any).railwayOfficialOnly && !isRailwayOfficial) return false;
      if ((item as any).accountsOfficialOnly && !isAccountsOfficial) return false;
        return true;
      })
    })).filter(group => group.items.length > 0);
  }, [isAdmin, isRailwayOfficial, isAccountsOfficial]);

  // Helper function to check if current path is in group
  const isGroupActive = (group: typeof navigationGroups[0]) => {
    return group.items.some(item => pathname === item.href);
  };

  const handleSignOut = async () => {
    await signOutToCurrentSite();
  };

  return (
    <nav className="sticky top-0 z-50 bg-white shadow-sm border-b border-gray-200">
      <div className="container mx-auto px-2 sm:px-4 max-w-7xl">
        <div className="flex justify-between items-center h-16">
          {/* Brand — landing page when logged out, dashboard when logged in */}
          <Link href={session ? '/contracts' : '/'} className="flex items-center space-x-2 sm:space-x-3 group">
            <img
              src="/logo.png"
              alt="IR-PVC logo"
              className="h-9 w-auto sm:h-10 object-contain transition-transform group-hover:scale-105"
            />
            <div className="flex flex-col">
              <span className="text-lg sm:text-xl font-bold text-emerald-600 hidden sm:block leading-tight tracking-tight">
                IR-PVC
              </span>

              <span className="text-sm font-bold text-emerald-600 block sm:hidden">
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
                        isActive && "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-semibold"
                      )}
                    >
                      <Link href={item.href}>
                        <ItemIcon className="h-4 w-4" />
                        <span>{translateNav(item.name)}</span>
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
                            groupActive && "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-semibold"
                          )}
                        >
                          <GroupIcon className="h-4 w-4" />
                          <span>{translateNav(group.name)}</span>
                          <ChevronDown className="h-3 w-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-56 max-h-[80vh] overflow-y-auto bg-white/95 backdrop-blur-sm">
                        {group.items.map((item, index) => {
                          const isActive = pathname === item.href;
                          const ItemIcon = item.icon;
                          // A heading each time the section changes. Admin had grown to
                          // two dozen entries in one unbroken list — findable only by
                          // reading all of it.
                          const section = (item as any).section as string | undefined;
                          const prevSection = (group.items[index - 1] as any)?.section as string | undefined;
                          const startsSection = !!section && section !== prevSection;
                          return (
                            <Fragment key={item.name}>
                            {startsSection && (
                              <div className={cn(
                                "px-2 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400",
                                index > 0 && "border-t border-slate-100 mt-1",
                              )}>
                                {section}
                              </div>
                            )}
                            <DropdownMenuItem asChild>
                              <Link 
                                href={item.href}
                                className={cn(
                                  "flex items-center space-x-2 w-full px-2 py-2 cursor-pointer",
                                  isActive && "bg-emerald-50 text-emerald-700 font-medium"
                                )}
                              >
                                <ItemIcon className="h-4 w-4" />
                                <span>{translateNav(item.name)}</span>
                              </Link>
                            </DropdownMenuItem>
                            </Fragment>
                          );
                        })}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  );
                })}
                
                {/* Credit Balance & Top-up - Show for all authenticated users.
                    One line, one chip, one small button. The two-row label with its
                    sublabel made this the widest thing in the header; the amount (or
                    the free-bill count) says everything the sublabel said. */}
                {creditData && (
                  <div className="flex items-center gap-1.5 ml-2 pl-2 border-l border-gray-200">
                    <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-gray-100 rounded-lg text-xs font-semibold whitespace-nowrap">
                      <Wallet className="h-3.5 w-3.5 text-gray-500" />
                      {creditData.trialInfo.isActive ? (
                        <span className="text-emerald-700">
                          {creditData.trialInfo.billsRemaining} free bill{creditData.trialInfo.billsRemaining !== 1 ? 's' : ''}
                        </span>
                      ) : (
                        <span className={hasInsufficientBalance ? 'text-red-600' : 'text-gray-800'}>
                          ₹{creditData.balance.toFixed(0)}
                        </span>
                      )}
                      {hasInsufficientBalance && <AlertCircle className="h-3.5 w-3.5 text-red-500" />}
                    </div>
                    <Button
                      onClick={() => setShowTopupDialog(true)}
                      size="sm"
                      title={translateNav('Top-up')}
                      className={cn(
                        "h-8 px-2.5 shadow-sm",
                        hasInsufficientBalance
                          ? "bg-red-500 text-white hover:bg-red-600"
                          : "bg-emerald-600 text-white hover:bg-emerald-700"
                      )}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                )}
                
                {/* Language Toggle */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-9 w-9 p-0 text-gray-700 hover:bg-gray-100 rounded-xl" title="Select Language">
                      <span className="text-sm font-bold tracking-tight">
                        {language === 'en' ? 'EN' : 'हि'}
                      </span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-24 bg-white/95 backdrop-blur-sm">
                    <DropdownMenuItem 
                      onClick={() => setLanguage('en')}
                      className={cn(
                        "cursor-pointer font-medium text-xs",
                        language === 'en' && "bg-emerald-50 text-emerald-700 font-semibold"
                      )}
                    >
                      English
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      onClick={() => setLanguage('hi')}
                      className={cn(
                        "cursor-pointer font-medium text-xs",
                        language === 'hi' && "bg-emerald-50 text-emerald-700 font-semibold"
                      )}
                    >
                      हिन्दी
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Theme Toggle */}
                <ThemeToggle />

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
                          <span>{translateNav('Profile & Settings')}</span>
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        onClick={handleSignOut}
                        className="text-red-600 hover:text-red-700 focus:text-red-700 cursor-pointer"
                      >
                        <LogOut className="mr-2 h-4 w-4" />
                        <span>{translateNav('Sign Out')}</span>
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
                <Button asChild size="sm" className="bg-emerald-600 text-white hover:bg-emerald-700">
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
                            <AlertCircle className="h-4 w-4 text-red-500" />
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
                            ? "bg-red-500 text-white hover:bg-red-600"
                            : "bg-emerald-600 text-white hover:bg-emerald-700"
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
                              isActive && "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-semibold"
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
                        {group.items.map((item, index) => {
                          const isActive = pathname === item.href;
                          const ItemIcon = item.icon;
                          const section = (item as any).section as string | undefined;
                          const prevSection = (group.items[index - 1] as any)?.section as string | undefined;
                          const startsSection = !!section && section !== prevSection;
                          return (
                            <Fragment key={item.name}>
                            {startsSection && (
                              <div className="px-2 pt-2 pb-0.5 ml-4 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                                {section}
                              </div>
                            )}
                            <Button
                              asChild
                              variant={isActive ? "secondary" : "ghost"}
                              size="sm"
                              className={cn(
                                "w-full justify-start flex items-center space-x-2 ml-4 text-gray-700 hover:bg-gray-100",
                                isActive && "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-semibold"
                              )}
                              onClick={() => setIsOpen(false)}
                            >
                              <Link href={item.href}>
                                <ItemIcon className="h-4 w-4" />
                                <span>{item.name}</span>
                              </Link>
                            </Button>
                            </Fragment>
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
                          <span className="ml-2">{translateNav('Profile & Settings')}</span>
                        </Link>
                      </Button>
                      <Button
                        asChild
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start text-gray-700 hover:bg-gray-100"
                      >
                        <Link href="/profile" onClick={() => setIsOpen(false)}>
                          <CreditCard className="h-4 w-4" />
                          <span className="ml-2">{translateNav('Profile & Billing')}</span>
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
                        <span className="ml-2">{translateNav('Sign Out')}</span>
                      </Button>
                    </div>
                </>
              ) : !isOnAuthPage ? (
                <div className="flex flex-col space-y-2">
                  <Button asChild variant="ghost" size="sm" className="text-gray-700 hover:bg-gray-100" onClick={() => setIsOpen(false)}>
                    <Link href="/auth/signin">Sign In</Link>
                  </Button>
                  <Button asChild size="sm" className="bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => setIsOpen(false)}>
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
