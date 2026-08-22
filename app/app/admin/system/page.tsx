'use client';

/** System: the app's own plumbing — report layouts, pending schema changes, stored files. */

import dynamic from 'next/dynamic';
import { AdminHubPage } from '@/components/admin/admin-hub';
import { LoadingSpinner } from '@/components/ui/loading-spinner';

const loading = () => <div className="flex justify-center py-16"><LoadingSpinner size="lg" text="Loading…" /></div>;
const load = (importer: any) => dynamic(importer, { ssr: false, loading });

const ReportTemplates = load(() => import('../../report-templates/page'));
const PendingDbChange = load(() => import('../pending-db-change/page'));
const Storage = load(() => import('../storage/page'));

export default function AdminSystemPage() {
  return (
    <AdminHubPage
      title="System"
      description="What the reports look like, database changes waiting to be applied, and what is taking up storage."
      tabs={[
        { key: 'templates', name: 'Report templates', href: '/report-templates', render: () => <ReportTemplates /> },
        { key: 'db', name: 'Pending DB changes', href: '/admin/pending-db-change', render: () => <PendingDbChange /> },
        { key: 'storage', name: 'Storage', href: '/admin/storage', render: () => <Storage /> },
      ]}
    />
  );
}
