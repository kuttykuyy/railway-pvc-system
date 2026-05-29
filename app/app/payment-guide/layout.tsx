
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Credit Purchase Guide',
  description: 'Learn how to purchase credits and manage billing for IR-PVC system',
};

export default function PaymentGuideLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
