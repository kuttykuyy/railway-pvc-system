'use client';

/** Rates & indices: every published figure the PVC calculation draws on, and how work is classified. */

import dynamic from 'next/dynamic';
import { AdminHubPage } from '@/components/admin/admin-hub';
import { LoadingSpinner } from '@/components/ui/loading-spinner';

const loading = () => <div className="flex justify-center py-16"><LoadingSpinner size="lg" text="Loading…" /></div>;
const load = (importer: any) => dynamic(importer, { ssr: false, loading });

const IndicesManage = load(() => import('../../indices/page'));
const ComponentDocuments = load(() => import('../../indices/component-documents/page'));
const RateBooks = load(() => import('../rate-books/page'));
const CementCoefficients = load(() => import('../dsr-cement-coefficients/page'));
const QuoteSpread = load(() => import('../dsr-quote-spread/page'));
const Classifications = load(() => import('../../classifications/page'));
const ExtensionSubcategories = load(() => import('../extension-subcategories/page'));

export default function AdminRatesPage() {
  return (
    <AdminHubPage
      title="Rates & indices"
      description="The published indices and rate books the calculation reads, the documents they came from, and the classifications that decide each item's component split."
      tabs={[
        { key: 'indices', name: 'Price indices', href: '/indices', render: () => <IndicesManage /> },
        { key: 'documents', name: 'Component documents', href: '/indices/component-documents', render: () => <ComponentDocuments /> },
        { key: 'rate-books', name: 'Schedules of rates', href: '/admin/rate-books', render: () => <RateBooks /> },
        { key: 'cement', name: 'Cement coefficients', href: '/admin/dsr-cement-coefficients', render: () => <CementCoefficients /> },
        { key: 'quote-spread', name: 'Quoted vs schedule', href: '/admin/dsr-quote-spread', render: () => <QuoteSpread /> },
        { key: 'classifications', name: 'Work classifications', href: '/classifications', render: () => <Classifications /> },
        { key: 'extensions', name: 'Extension categories', href: '/admin/extension-subcategories', render: () => <ExtensionSubcategories /> },
      ]}
    />
  );
}
