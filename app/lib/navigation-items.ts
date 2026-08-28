import {
  BarChart3, Briefcase, Building2, Calculator, CheckSquare, CreditCard, Database,
  FileText, Gift, Home, LineChart, MessageSquare, ShieldCheck, Star, User, UserCircle,
  PlayCircle } from 'lucide-react';

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
  /**
   * Which heading this sits under inside its menu. Admin had grown to two dozen
   * entries in one unbroken list, in no order, which is a scroll rather than a menu.
   * Items sharing a section render together under its name; the order below is the
   * order shown.
   */
  section?: string;
}

/** Admin section headings, in the order they appear. */
export const ADMIN_SECTIONS = [
  'Money & Billing',
  'People & Access',
  'Rates & Indices',
  'Checks & Audits',
  'Integrations',
  'System',
] as const;

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
  // CPWD (Clause 10CA/10CC) — a distinct home for the second pricing scheme, linking to
  // the contract and bill lists pre-filtered to CPWD. Admin-gated while CPWD is piloted;
  // widen (drop adminOnly) once CPWD contractors are onboarded.
  { name: 'CPWD Contracts', href: '/contracts?scheme=cpwd', icon: Building2, adminOnly: true, section: 'CPWD' },
  { name: 'CPWD Bills', href: '/bills?scheme=cpwd', icon: FileText, adminOnly: true, section: 'CPWD' },
];

/**
 * Reference data anyone may read. Note /indices/view, NOT /indices — the latter is the
 * admin management screen, and pointing a contractor at it bounced them straight out.
 */
export const REFERENCE_ITEMS: NavItem[] = [
  { name: 'Price Indices', href: '/indices/view', icon: LineChart, adminOnly: false },
  // The two-upload walkthrough. In the main menu for every role, so a person who is
  // stuck mid-way can find it without leaving the page they are stuck on.
  { name: 'How it works', href: '/how-it-works', icon: PlayCircle, adminOnly: false },
];

/**
 * Everything behind the admin gate (app/admin/layout.tsx enforces it server-side).
 *
 * Six doors, not twenty-five. The menu had one entry per admin screen, under six
 * headings — a list nobody read, that had to be scrolled to reach System, and that grew
 * by one line every time a screen was added. Each heading is now one page whose screens
 * are tabs (components/admin/admin-hub.tsx), loaded only when opened.
 *
 * Every old route still exists and still works: bookmarks, links from inside the app
 * ("Admin → Cement Coefficients") and anything a person saved keep working, and each
 * tab can be linked to directly with ?tab=.
 */
export const ADMIN_ITEMS: NavItem[] = [
  { name: 'Money & Billing', href: '/admin/money', icon: CreditCard, adminOnly: true },
  { name: 'People & Access', href: '/admin/people', icon: User, adminOnly: true },
  { name: 'Rates & Indices', href: '/admin/rates', icon: LineChart, adminOnly: true },
  { name: 'Checks & Audits', href: '/admin/checks', icon: ShieldCheck, adminOnly: true },
  { name: 'Integrations', href: '/admin/integrations', icon: MessageSquare, adminOnly: true },
  { name: 'System', href: '/admin/system', icon: Database, adminOnly: true },
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
