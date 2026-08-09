import {
  AlertCircle, BarChart3, Briefcase, Building2, Calculator, CheckSquare, CreditCard, Database,
  FileBarChart, FileText, Gift, Home, Layers, LineChart, MessageSquare, Package, Receipt, Send,
  Settings, ShieldCheck, Sparkles, Star, Tags, TrendingUp, User, UserCircle, Wallet, BookOpen } from 'lucide-react';

/**
 * Every screen in the menu, in one place.
 *
 * The desktop and mobile menus were separate hand-kept lists, so a page added to one
 * simply never appeared in the other — mobile fell nine entries behind, and its "Price
 * Indices" pointed at the admin management screen, bouncing every contractor who tapped
 * it. Both now read this. Adding a screen here puts it on both.
 *
 * Each surface still renders in its own way and groups things to suit its shape; what is
 * shared is WHICH screens exist, where they live and who may see them.
 */

export interface NavItem {
  name: string;
  href: string;
  icon: any;
  /** Admins (and superadmins) only. */
  adminOnly?: boolean;
  /** The executive side — railway officials. */
  railwayOfficialOnly?: boolean;
  /** The accounts / audit office. */
  accountsOfficialOnly?: boolean;
}

/** The everyday screens: contracts, bills, and the two department queues. */
export const WORK_ITEMS: NavItem[] = [
  { name: 'Dashboard', href: '/dashboard', icon: Home, adminOnly: true },
  { name: 'Contracts', href: '/contracts', icon: Briefcase, adminOnly: false },
  { name: 'PVC Bills', href: '/bills', icon: FileText, adminOnly: false },
  { name: 'Bill Approvals', href: '/approvals', icon: CheckSquare, railwayOfficialOnly: true },
  { name: 'Accounts / Audit', href: '/accounts', icon: CheckSquare, accountsOfficialOnly: true },
  { name: 'Abstract of Bills', href: '/reports/abstract', icon: Calculator, adminOnly: false },
  { name: 'Tendering Estimator', href: '/tendering-estimator', icon: BarChart3, adminOnly: false },
  { name: 'Refer & Earn', href: '/referrals', icon: Gift, adminOnly: false },
];

/**
 * Reference data anyone may read. Note /indices/view, NOT /indices — the latter is the
 * admin management screen, and pointing a contractor at it bounced them straight out.
 */
export const REFERENCE_ITEMS: NavItem[] = [
  { name: 'Price Indices', href: '/indices/view', icon: LineChart, adminOnly: false },
];

/** Everything behind the admin gate (app/admin/layout.tsx enforces it server-side). */
export const ADMIN_ITEMS: NavItem[] = [
  { name: 'PVC Check Analytics', href: '/admin/analytics', icon: TrendingUp, adminOnly: true },
  { name: 'Report Templates', href: '/report-templates', icon: Layers, adminOnly: true },
  { name: 'Work Classifications', href: '/classifications', icon: Tags, adminOnly: true },
  { name: 'Extension Categories', href: '/admin/extension-subcategories', icon: FileBarChart, adminOnly: true },
  { name: 'Price Indices Management', href: '/indices', icon: LineChart, adminOnly: true },
  { name: 'Schedules of Rates', href: '/admin/rate-books', icon: BookOpen, adminOnly: true },
  { name: 'Cement Coefficients', href: '/admin/dsr-cement-coefficients', icon: Package, adminOnly: true },
  { name: 'Component Index Documents', href: '/indices/component-documents', icon: FileText, adminOnly: true },
  { name: 'GST Invoices', href: '/admin/gst-invoices', icon: Receipt, adminOnly: true },
  { name: 'User Management', href: '/admin/users', icon: User, adminOnly: true },
  { name: 'Role & Permissions', href: '/admin/user-permissions', icon: ShieldCheck, adminOnly: true },
  { name: 'Railway Official Limits', href: '/admin/railway-official-settings', icon: ShieldCheck, adminOnly: true },
  { name: 'Credit Statements', href: '/admin/credit-statements', icon: Wallet, adminOnly: true },
  { name: 'WhatsApp Logs', href: '/admin/whatsapp-logs', icon: MessageSquare, adminOnly: true },
  { name: 'Telegram Usage', href: '/admin/telegram', icon: Send, adminOnly: true },
  { name: 'Steel City Audit', href: '/admin/steel-city-audit', icon: AlertCircle, adminOnly: true },
  { name: 'JPC Cross-check', href: '/admin/jpc-cross-check', icon: ShieldCheck, adminOnly: true },
  { name: 'Classification %', href: '/admin/classification-audit', icon: Tags, adminOnly: true },
  { name: 'Pending DB Changes', href: '/admin/pending-db-change', icon: Database, adminOnly: true },
  { name: 'Demo Accounts', href: '/admin/demo-accounts', icon: User, adminOnly: true },
  { name: 'Review Rewards', href: '/admin/review-rewards', icon: Star, adminOnly: true },
  { name: 'AI Usage & Credit', href: '/admin/ai-usage', icon: Sparkles, adminOnly: true },
];

/**
 * The user's own account. Only the phone menu lists these — the desktop header carries
 * them as its own controls — so they are kept apart rather than forced into both.
 */
export const ACCOUNT_ITEMS: NavItem[] = [
  { name: 'Profile', href: '/profile', icon: UserCircle, adminOnly: false },
  { name: 'Profile & Billing', href: '/profile', icon: CreditCard, adminOnly: false },
  { name: 'Refer & Earn', href: '/referrals', icon: Gift, adminOnly: false },
  { name: 'Review Reward', href: '/review-reward', icon: Star, adminOnly: false },
];

/** Shortcuts on the phone's menu sheet. Nothing on desktop corresponds to these. */
export const QUICK_ACTIONS: Array<NavItem & { color: string }> = [
  { name: 'New Bill', href: '/bills/new', icon: FileText, color: 'bg-gradient-to-br from-emerald-500 to-emerald-600', adminOnly: true },
  { name: 'New Contract', href: '/contracts/new', icon: Building2, color: 'bg-gradient-to-br from-emerald-500 to-emerald-600', adminOnly: true },
];

/**
 * Whether a role may see an item. One rule, so a screen cannot be hidden on one surface
 * and shown on the other.
 */
export function canSeeNavItem(
  item: NavItem,
  roles: { isAdmin: boolean; isRailwayOfficial: boolean; isAccountsOfficial: boolean },
): boolean {
  if (item.adminOnly && !roles.isAdmin) return false;
  if (item.railwayOfficialOnly && !roles.isRailwayOfficial) return false;
  if (item.accountsOfficialOnly && !roles.isAccountsOfficial) return false;
  return true;
}
