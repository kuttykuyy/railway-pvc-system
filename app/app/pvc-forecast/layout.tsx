import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Steel PVC Forecast',
  description: 'Forecast steel PVC impact across quarters to plan work timing',
};

export default function PvcForecastLayout({ children }: { children: React.ReactNode }) {
  return children;
}
