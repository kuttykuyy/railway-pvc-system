import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'API Keys',
  description: 'Manage API keys for external app integration'
};

export default function ApiKeysLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
