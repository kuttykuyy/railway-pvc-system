import type { Metadata } from 'next';

// The page itself is a client component and cannot export metadata, so its title,
// description and canonical live here. Without this it inherited the site-wide default
// and was indistinguishable from seven other pages in search results.
export const metadata: Metadata = {
  title: 'Contact IR-PVC support',
  description: 'Reach the IR-PVC team for help with PVC bills, contracts, price indices, payments or your account. Support in English and Hindi.',
  alternates: { canonical: '/contact' },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
