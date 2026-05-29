
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Extension Categories',
  description: 'Manage extension categories for contract time and cost adjustments',
};

export default function ExtensionCategoriesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
