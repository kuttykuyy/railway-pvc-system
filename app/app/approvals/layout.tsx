
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Bill Approvals',
  description: 'Review and approve pending PVC bills for Indian Railway contracts',
};

export default function ApprovalsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
