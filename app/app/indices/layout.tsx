
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Price Indices Management',
  description: 'Manage wholesale price indices and component-wise index values for PVC calculations',
};

export default function IndicesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
