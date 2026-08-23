'use client';

/** People & access: who has an account, what their role lets them see, and the demo logins. */

import dynamic from 'next/dynamic';
import { AdminHubPage } from '@/components/admin/admin-hub';
import { LoadingSpinner } from '@/components/ui/loading-spinner';

const loading = () => <div className="flex justify-center py-16"><LoadingSpinner size="lg" text="Loading…" /></div>;
const load = (importer: any) => dynamic(importer, { ssr: false, loading });

const Users = load(() => import('../users/page'));
const Permissions = load(() => import('../user-permissions/page'));
const RailwayOfficialSettings = load(() => import('../railway-official-settings/page'));
const DemoAccounts = load(() => import('../demo-accounts/page'));
const Jurisdiction = load(() => import('../jurisdiction/page'));

export default function AdminPeoplePage() {
  return (
    <AdminHubPage
      title="People & access"
      description="Accounts, the roles that decide what each of them can reach, and the demo logins used for walkthroughs."
      tabs={[
        { key: 'users', name: 'User management', href: '/admin/users', render: () => <Users /> },
        { key: 'permissions', name: 'Roles & permissions', href: '/admin/user-permissions', render: () => <Permissions /> },
        { key: 'officials', name: 'Railway official limits', href: '/admin/railway-official-settings', render: () => <RailwayOfficialSettings /> },
        { key: 'demo', name: 'Demo accounts', href: '/admin/demo-accounts', render: () => <DemoAccounts /> },
        { key: 'jurisdiction', name: 'Jurisdiction transfers', href: '/admin/jurisdiction', render: () => <Jurisdiction /> },
      ]}
    />
  );
}
