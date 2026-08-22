'use client';

/** Money & billing: what customers are charged, what they were invoiced, and what they used. */

import dynamic from 'next/dynamic';
import { AdminHubPage } from '@/components/admin/admin-hub';
import { LoadingSpinner } from '@/components/ui/loading-spinner';

const loading = () => <div className="flex justify-center py-16"><LoadingSpinner size="lg" text="Loading…" /></div>;
const load = (importer: any) => dynamic(importer, { ssr: false, loading });

const PaymentSettings = load(() => import('../payment-settings/page'));
const GstInvoices = load(() => import('../gst-invoices/page'));
const CreditStatements = load(() => import('../credit-statements/page'));
const AiUsage = load(() => import('../ai-usage/page'));
const ReviewRewards = load(() => import('../review-rewards/page'));
const TrialClaims = load(() => import('../trial-claims/page'));
const Analytics = load(() => import('../analytics/page'));

export default function AdminMoneyPage() {
  return (
    <AdminHubPage
      title="Money & billing"
      description="Prices and free-bill rules, the invoices raised against them, and what each account has actually spent."
      tabs={[
        { key: 'settings', name: 'Payment settings', href: '/admin/payment-settings', render: () => <PaymentSettings /> },
        { key: 'invoices', name: 'GST invoices', href: '/admin/gst-invoices', render: () => <GstInvoices /> },
        { key: 'statements', name: 'Credit statements', href: '/admin/credit-statements', render: () => <CreditStatements /> },
        { key: 'ai', name: 'AI usage & credit', href: '/admin/ai-usage', render: () => <AiUsage /> },
        { key: 'rewards', name: 'Review rewards', href: '/admin/review-rewards', render: () => <ReviewRewards /> },
        { key: 'free-bills', name: 'Free bills used', href: '/admin/trial-claims', render: () => <TrialClaims /> },
        { key: 'analytics', name: 'PVC check analytics', href: '/admin/analytics', render: () => <Analytics /> },
      ]}
    />
  );
}
