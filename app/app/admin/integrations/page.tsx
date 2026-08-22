'use client';

/** Integrations: the ways in and out of the app that are not the website itself. */

import dynamic from 'next/dynamic';
import { AdminHubPage } from '@/components/admin/admin-hub';
import { LoadingSpinner } from '@/components/ui/loading-spinner';

const loading = () => <div className="flex justify-center py-16"><LoadingSpinner size="lg" text="Loading…" /></div>;
const load = (importer: any) => dynamic(importer, { ssr: false, loading });

const WhatsappLogs = load(() => import('../whatsapp-logs/page'));
const Telegram = load(() => import('../telegram/page'));
const ApiKeys = load(() => import('../api-keys/page'));

export default function AdminIntegrationsPage() {
  return (
    <AdminHubPage
      title="Integrations"
      description="WhatsApp and Telegram traffic, and the API keys other systems use to reach this one."
      tabs={[
        { key: 'whatsapp', name: 'WhatsApp logs', href: '/admin/whatsapp-logs', render: () => <WhatsappLogs /> },
        { key: 'telegram', name: 'Telegram usage', href: '/admin/telegram', render: () => <Telegram /> },
        { key: 'api-keys', name: 'API keys', href: '/admin/api-keys', render: () => <ApiKeys /> },
      ]}
      extraLinks={[{ name: 'API documentation', href: '/docs/external-api' }]}
    />
  );
}
