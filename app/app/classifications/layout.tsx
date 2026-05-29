
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Work Classifications',
  description: 'Manage work classifications and GCC item codes for railway contracts',
};

export default function ClassificationsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
