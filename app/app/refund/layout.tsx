import type { Metadata } from 'next';

// The page itself is a client component and cannot export metadata, so its title,
// description and canonical live here. Without this it inherited the site-wide default
// and was indistinguishable from seven other pages in search results.
export const metadata: Metadata = {
  title: 'Refund Policy',
  description: 'When and how IR-PVC credits and bill charges are refunded, and how to raise a refund request.',
  alternates: { canonical: '/refund' },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
