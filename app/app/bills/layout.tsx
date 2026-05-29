
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'PVC Bills',
  description: 'Manage and track running account bills with automated PVC calculations for Indian Railway contracts',
};

export default function BillsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
