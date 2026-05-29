import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'External API Documentation',
  description: 'API documentation for integrating external apps with irpvc.in'
};

export default function ExternalApiDocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
