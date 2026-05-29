
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Work Classification Analyzer',
  description: 'Compare PVC impact across different work classifications for Indian Railway contracts',
};

export default function ClassAnalyzerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
