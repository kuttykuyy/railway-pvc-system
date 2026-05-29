
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Role & Permissions',
  description: 'Manage user roles and access control permissions',
};

export default function UserPermissionsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
