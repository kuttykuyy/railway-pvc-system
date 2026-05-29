
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'PVC Reports',
  description: 'Generate comprehensive PVC reports and abstracts for Indian Railway bills',
};

export default function ReportsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
