
// Available pages in the system with their metadata
export interface PageDefinition {
  path: string;
  name: string;
  category: string;
  description: string;
  icon?: string;
  adminOnly?: boolean; // If true, only admins can access regardless of permissions
}

export const AVAILABLE_PAGES: PageDefinition[] = [
  // Main Pages
  {
    path: '/dashboard',
    name: 'Dashboard',
    category: 'Main',
    description: 'Overview and statistics',
    icon: 'Home'
  },
  {
    path: '/contracts',
    name: 'Contracts',
    category: 'Main',
    description: 'View and manage contracts',
    icon: 'Building2'
  },
  {
    path: '/contracts/new',
    name: 'Create Contract',
    category: 'Main',
    description: 'Create a new contract',
    icon: 'Plus'
  },
  {
    path: '/bills',
    name: 'Bills',
    category: 'Main',
    description: 'View and manage bills',
    icon: 'FileText'
  },
  {
    path: '/bills/new',
    name: 'Create Bill',
    category: 'Main',
    description: 'Create a new bill',
    icon: 'Plus'
  },
  {
    path: '/bills/bulk-new',
    name: 'Bulk Create Bills',
    category: 'Main',
    description: 'Create multiple bills at once',
    icon: 'Layers'
  },
  
  // Reports & Data
  {
    path: '/reports',
    name: 'Reports',
    category: 'Reports',
    description: 'View detailed reports',
    icon: 'BarChart3'
  },
  {
    path: '/reports/abstract',
    name: 'Abstract Report',
    category: 'Reports',
    description: 'View abstract reports',
    icon: 'FileText'
  },
  {
    path: '/indices',
    name: 'Price Indices',
    category: 'Data',
    description: 'Manage price indices',
    icon: 'TrendingUp'
  },
  {
    path: '/classifications',
    name: 'Work Classifications',
    category: 'Data',
    description: 'Manage work classifications',
    icon: 'ListChecks'
  },
  {
    path: '/classifications-new',
    name: 'GCC Classifications',
    category: 'Data',
    description: 'Manage GCC-2022 classifications',
    icon: 'Layers'
  },
  
  // Account & Settings
  {
    path: '/billing',
    name: 'Billing',
    category: 'Account',
    description: 'View billing and usage',
    icon: 'CreditCard'
  },
  {
    path: '/profile',
    name: 'Profile',
    category: 'Account',
    description: 'Manage user profile',
    icon: 'User'
  },
  {
    path: '/settings',
    name: 'Settings',
    category: 'Settings',
    description: 'Application settings',
    icon: 'Settings'
  },
  
  // Admin Pages (Always admin-only)
  {
    path: '/admin/users',
    name: 'User Management',
    category: 'Admin',
    description: 'Manage users and accounts',
    icon: 'Users',
    adminOnly: true
  },
  {
    path: '/admin/user-permissions',
    name: 'User Permissions',
    category: 'Admin',
    description: 'Manage user permissions',
    icon: 'Shield',
    adminOnly: true
  },
  {
    path: '/admin/settings',
    name: 'System Settings',
    category: 'Admin',
    description: 'Configure system settings',
    icon: 'Settings',
    adminOnly: true
  },
  {
    path: '/admin/extension-subcategories',
    name: 'Extension Categories',
    category: 'Admin',
    description: 'Manage extension subcategories',
    icon: 'Layers',
    adminOnly: true
  },
  
  // Help
  {
    path: '/help',
    name: 'Help & Support',
    category: 'Support',
    description: 'Get help and support',
    icon: 'HelpCircle'
  }
];

// Group pages by category
export function getPagesByCategory(): Record<string, PageDefinition[]> {
  const grouped: Record<string, PageDefinition[]> = {};
  
  AVAILABLE_PAGES.forEach(page => {
    if (!grouped[page.category]) {
      grouped[page.category] = [];
    }
    grouped[page.category].push(page);
  });
  
  return grouped;
}

// Get page definition by path
export function getPageByPath(path: string): PageDefinition | undefined {
  return AVAILABLE_PAGES.find(page => page.path === path);
}

// Check if a path is an admin-only page
export function isAdminOnlyPage(path: string): boolean {
  const page = getPageByPath(path);
  return page?.adminOnly || false;
}

// Get all non-admin pages
export function getNonAdminPages(): PageDefinition[] {
  return AVAILABLE_PAGES.filter(page => !page.adminOnly);
}
