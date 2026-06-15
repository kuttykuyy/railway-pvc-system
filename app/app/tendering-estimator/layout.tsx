import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Tendering & Bidding PVC Estimator',
  description: 'Simulate and forecast PVC escalation payouts for railway contract tenders',
};

export default function TenderingEstimatorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
