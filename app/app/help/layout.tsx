
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Help Center',
  description: 'Get help with using the IR-PVC system for railway contract management',
};

export default function HelpLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
