
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'System Configuration',
  description: 'Configure system-wide settings and preferences',
};

export default function SystemSettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
