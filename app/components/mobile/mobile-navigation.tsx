'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle, SheetClose } from '@/components/ui/sheet';
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
  MessageSquare,
  Wallet,
  Gift
  ,Star
  ,Sparkles
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getClientRoleInfo } from '@/lib/role-auth-client';
import { useLanguage } from '../i18n-provider';

const mobileNavSections = [
  {
    title: 'Main',
    items: [
      { name: 'Dashboard', href: '/dashboard', icon: Home, adminOnly: true },
      { name: 'Contracts', href: '/contracts', icon: Building2, adminOnly: false },
      { name: 'Bills', href: '/bills', icon: FileText, adminOnly: false },
      { name: 'Approvals', href: '/approvals', icon: ListChecks, railwayOfficialOnly: true },
      { name: 'Accounts', href: '/accounts', icon: ListChecks, accountsOfficialOnly: true },
    ]
  },
  {
    title: 'Reports & Data',
    items: [
      { name: 'Abstract', href: '/reports/abstract', icon: Calculator, adminOnly: false },
      { name: 'Tendering Estimator', href: '/tendering-estimator', icon: BarChart3, adminOnly: false },
      // The read-only view, as on desktop. /indices is the admin management screen, so a
      // contractor tapping this was bounced straight back out.
      { name: 'Price Indices', href: '/indices/view', icon: TrendingUp, adminOnly: false },
      { name: 'Price Indices Management', href: '/indices', icon: TrendingUp, adminOnly: true },
      { name: 'Component Index Documents', href: '/indices/component-documents', icon: FileText, adminOnly: true },
      { name: 'Classifications', href: '/classifications', icon: ListChecks, adminOnly: true },
      { name: 'Report Templates', href: '/report-templates', icon: FileText, adminOnly: true },
      { name: 'Extension Subcategories', href: '/admin/extension-subcategories', icon: Calculator, adminOnly: true },
    ]
  },
  {
    title: 'Account',
    items: [
      { name: 'Profile', href: '/profile', icon: UserCircle, adminOnly: false },
      { name: 'Profile & Billing', href: '/profile', icon: CreditCard, adminOnly: false },
      { name: 'Refer & Earn', href: '/referrals', icon: Gift, adminOnly: false },
      { name: 'Review Reward', href: '/review-reward', icon: Star, adminOnly: false },
      { name: 'PVC Check Analytics', href: '/admin/analytics', icon: TrendingUp, adminOnly: true },
      { name: 'User Management', href: '/admin/users', icon: User, adminOnly: true },
      { name: 'User Permissions', href: '/admin/user-permissions', icon: Settings, adminOnly: true },
      { name: 'Credit Statements', href: '/admin/credit-statements', icon: Wallet, adminOnly: true },
      { name: 'Review Rewards', href: '/admin/review-rewards', icon: Star, adminOnly: true },
      { name: 'WhatsApp Logs', href: '/admin/whatsapp-logs', icon: MessageSquare, adminOnly: true },
      { name: 'AI Usage & Credit', href: '/admin/ai-usage', icon: Sparkles, adminOnly: true },
      { name: 'Cement Coefficients', href: '/admin/dsr-cement-coefficients', icon: Calculator, adminOnly: true },
      { name: 'Classification %', href: '/admin/classification-audit', icon: ListChecks, adminOnly: true },
      { name: 'GST Invoices', href: '/admin/gst-invoices', icon: FileText, adminOnly: true },
      { name: 'Railway Official Limits', href: '/admin/railway-official-settings', icon: Settings, adminOnly: true },
      { name: 'Steel City Audit', href: '/admin/steel-city-audit', icon: TrendingUp, adminOnly: true },
      { name: 'Telegram Usage', href: '/admin/telegram', icon: MessageSquare, adminOnly: true },
      { name: 'Demo Accounts', href: '/admin/demo-accounts', icon: User, adminOnly: true },
      { name: 'Pending DB Changes', href: '/admin/pending-db-change', icon: Settings, adminOnly: true },
    ]
  }
];

const quickActions = [
  { name: 'New Bill', href: '/bills/new', icon: FileText, color: 'bg-gradient-to-br from-emerald-500 to-emerald-600', adminOnly: true },
  { name: 'New Contract', href: '/contracts/new', icon: Building2, color: 'bg-gradient-to-br from-emerald-500 to-emerald-600', adminOnly: true },
];

interface MobileNavigationProps {
  asSheet?: boolean;
}

export default function MobileNavigation({ asSheet = false }: MobileNavigationProps) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [isOpen, setIsOpen] = useState(false);
  
  const { isAdmin, isRailwayOfficial, isAccountsOfficial, role } = getClientRoleInfo(session);
  const { language, setLanguage, t } = useLanguage();
  
  // Get role display label
  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'admin':
        return language === 'hi' ? 'एडमिन' : 'Admin';
      case 'pending_railway_official':
        return language === 'hi' ? 'लंबित अधिकारी' : 'Pending Official';
      case 'railway_official':
        return language === 'hi' ? 'रेलवे अधिकारी' : 'Railway Official';
      case 'contractor':
        return language === 'hi' ? 'ठेकेदार' : 'Contractor';
      default:
        return language === 'hi' ? 'ठेकेदार' : 'Contractor';
    }
  };

  const getNavTranslationKey = (name: string): string => {
    switch (name) {
      // Sections
      case 'Main': return 'nav.main_section';
      case 'Reports & Data': return 'nav.reports_section';
      case 'Account': return 'nav.account_section';
      // Items
      case 'Dashboard': return 'nav.dashboard';
      case 'Contracts': return 'nav.contracts';
      case 'Bills': return 'nav.bills';
      case 'Approvals': return 'nav.approvals';
      case 'Abstract': return 'nav.abstract';
      case 'Steel PVC Forecast': return 'nav.forecast';
      case 'Price Indices': return 'nav.price_indices';
      case 'Component Index Documents': return 'nav.component_docs';
      case 'Classifications': return 'nav.classifications';
      case 'Report Templates': return 'nav.templates';
      case 'Extension Subcategories': return 'nav.extensions';
      case 'Profile': return 'nav.profile';
      case 'Profile & Billing': return 'nav.profile_billing';
      case 'Refer & Earn': return '';
      case 'Review Reward': return '';
      case 'Review Rewards': return '';
      case 'PVC Check Analytics': return 'nav.analytics';
      case 'User Management': return 'nav.users';
      case 'User Permissions': return 'nav.permissions';
      case 'WhatsApp Logs': return 'nav.whatsapp_logs';
      // Quick actions
      case 'New Bill': return 'dash.new_bill';
      case 'New Contract': return 'dash.contract';
      default: return '';
    }
  };

  const translateNav = (name: string) => {
    const key = getNavTranslationKey(name);
    if (key === 'dash.contract') {
      return language === 'hi' ? 'नया अनुबंध' : 'New Contract';
    }
    return key ? t(key) : name;
  };
  
  const filteredQuickActions = quickActions.filter(action => !action.adminOnly || isAdmin);
  const filteredSections = mobileNavSections.map(section => ({
    ...section,
    items: section.items.filter(item => {
      if ((item as any).adminOnly && !isAdmin) return false;
      if ((item as any).railwayOfficialOnly && !isRailwayOfficial) return false;
      if ((item as any).accountsOfficialOnly && !isAccountsOfficial) return false;
      return true;
    })
  })).filter(section => section.items.length > 0);

  const handleSignOut = () => {
    signOut({ callbackUrl: '/auth/signin' });
    setIsOpen(false);
  };

  const NavLink = ({ href, onClick, className, children }: { href: string; onClick?: () => void; className?: string; children: React.ReactNode }) => {
    const content = (
      <Link href={href} onClick={onClick} className={className}>
        {children}
      </Link>
    );
    return asSheet ? <SheetClose asChild>{content}</SheetClose> : content;
  };

  const menuContent = (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <SheetHeader className="px-6 py-5 bg-gradient-to-br from-emerald-600 to-emerald-700 text-white">
        <div className="flex items-center justify-between">
          <SheetTitle className="text-left text-white text-xl font-bold">
            IR-PVC
          </SheetTitle>
          <div className="flex items-center space-x-1 bg-white/10 rounded-lg p-0.5 border border-white/20">
            <button
              onClick={() => setLanguage('en')}
              className={cn(
                "px-2.5 py-1 text-xs font-semibold rounded-md transition-all duration-150",
                language === 'en'
                  ? "bg-white text-emerald-700 shadow-sm"
                  : "text-emerald-100 hover:text-white"
              )}
            >
              EN
            </button>
            <button
              onClick={() => setLanguage('hi')}
              className={cn(
                "px-2.5 py-1 text-xs font-semibold rounded-md transition-all duration-150",
                language === 'hi'
                  ? "bg-white text-emerald-700 shadow-sm"
                  : "text-emerald-100 hover:text-white"
              )}
            >
              हिन्दी
            </button>
          </div>
        </div>
        {session?.user && (
          <div className="flex items-center space-x-3 mt-3 pt-3 border-t border-emerald-500">
            <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
              <span className="text-lg font-medium text-white">
                {session.user.name?.[0] || session.user.email?.[0] || 'U'}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-white truncate">
                {session.user.name || (language === 'hi' ? 'उपयोगकर्ता' : 'User')}
              </div>
              <div className="text-xs text-emerald-200 truncate">
                {session.user.email}
              </div>
              <div className="text-xs text-emerald-200 font-medium mt-0.5">
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
                <NavLink
                  key={action.href}
                  href={action.href}
                  onClick={() => setIsOpen(false)}
                  className="group"
                >
                  <div className={`flex flex-col items-center justify-center p-4 rounded-xl ${action.color} text-white hover:shadow-lg transition-all duration-200 transform hover:scale-105`}>
                    <action.icon className="h-6 w-6 mb-2" />
                    <span className="text-xs font-medium text-center">
                      {translateNav(action.name)}
                    </span>
                  </div>
                </NavLink>
              ))}
            </div>
          </div>
        )}

        {filteredQuickActions.length > 0 && <Separator className="my-2" />}

        {/* Navigation Sections */}
        {filteredSections.map((section, idx) => (
          <div key={section.title} className="px-4 py-3">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 px-3">
              {translateNav(section.title)}
            </h3>
            <div className="space-y-1">
              {section.items.map((item) => (
                <NavLink
                  key={item.href}
                  href={item.href}
                  onClick={() => setIsOpen(false)}
                  className={cn(
                    "flex items-center space-x-3 px-3 py-2.5 rounded-lg transition-all duration-150",
                    pathname === item.href
                      ? "bg-emerald-50 text-emerald-700 font-medium"
                      : "text-gray-700 hover:bg-gray-50 active:bg-gray-100"
                  )}
                >
                  <item.icon className={cn(
                    "h-5 w-5",
                    pathname === item.href ? "text-emerald-600" : "text-gray-500"
                  )} />
                  <span className="flex-1 text-sm">{translateNav(item.name)}</span>
                </NavLink>
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
          {t('nav.sign_out')}
        </Button>
      </div>
    </div>
  );

  if (asSheet) {
    return menuContent;
  }

  return (
    <>
      {/* Mobile Navigation Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-sm border-b border-gray-200 shadow-sm">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center space-x-3">
            <Sheet open={isOpen} onOpenChange={setIsOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="sm" className="p-2 hover:bg-emerald-50">
                  <Menu className="h-6 w-6 text-gray-700" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[85vw] max-w-sm p-0">
                {menuContent}
              </SheetContent>
            </Sheet>
            
            <Link href={session?.user ? '/dashboard' : '/'} className="flex items-center space-x-2">
              <img src="/logo.png" alt="IR-PVC logo" className="h-8 w-auto object-contain" />
              <h1 className="text-lg font-bold bg-gradient-to-r from-emerald-600 to-emerald-800 bg-clip-text text-transparent">
                IR-PVC
              </h1>
            </Link>
          </div>

          {/* User Avatar */}
          <div className="flex items-center space-x-2">
            {session?.user && (
              <div className="w-9 h-9 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-full flex items-center justify-center shadow-sm">
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
