import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'PVC Check Analytics',
  description: 'View PVC check usage analytics and revenue metrics',
};

export default function AnalyticsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
