'use client';

/** Checks & audits: the places where the app's own figures and readings are verified. */

import dynamic from 'next/dynamic';
import { AdminHubPage } from '@/components/admin/admin-hub';
import { LoadingSpinner } from '@/components/ui/loading-spinner';

const loading = () => <div className="flex justify-center py-16"><LoadingSpinner size="lg" text="Loading…" /></div>;
const load = (importer: any) => dynamic(importer, { ssr: false, loading });

const ParseFailures = load(() => import('../parse-failures/page'));
const SteelCityAudit = load(() => import('../steel-city-audit/page'));
const JpcCrossCheck = load(() => import('../jpc-cross-check/page'));
const ClassificationAudit = load(() => import('../classification-audit/page'));
const AccessCompare = load(() => import('../access-compare/page'));

export default function AdminChecksPage() {
  return (
    <AdminHubPage
      title="Checks & audits"
      description="Where the app's own work is verified: PDFs it could not read, and index or percentage figures cross-checked against their published sources."
      tabs={[
        { key: 'parse-failures', name: 'Parse failures', href: '/admin/parse-failures', render: () => <ParseFailures /> },
        { key: 'steel-city', name: 'Steel city audit', href: '/admin/steel-city-audit', render: () => <SteelCityAudit /> },
        { key: 'jpc', name: 'JPC cross-check', href: '/admin/jpc-cross-check', render: () => <JpcCrossCheck /> },
        { key: 'classification', name: 'Classification %', href: '/admin/classification-audit', render: () => <ClassificationAudit /> },
        { key: 'access', name: 'Bill access check', href: '/admin/access-compare', render: () => <AccessCompare /> },
      ]}
    />
  );
}
