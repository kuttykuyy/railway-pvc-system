import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Getting Started Guide',
  description: 'Complete visual guide for first-time users of the IR-PVC System. Learn how to create contracts, generate PVC bills, and download reports.',
};

export default function GettingStartedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
