import type { Metadata } from 'next';

// The page itself is a client component and cannot export metadata, so its title,
// description and canonical live here. Without this it inherited the site-wide default
// and was indistinguishable from seven other pages in search results.
export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'How IR-PVC collects, uses and protects the contract, bill and account data of railway contractors using the Price Variation Clause calculator.',
  alternates: { canonical: '/privacy' },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
