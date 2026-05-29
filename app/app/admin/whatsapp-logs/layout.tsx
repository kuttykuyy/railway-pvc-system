
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'WhatsApp Logs',
  description: 'View and monitor WhatsApp messages sent from the system',
};

export default function WhatsAppLogsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
