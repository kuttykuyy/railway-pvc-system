import type { Metadata } from 'next';

// The page itself is a client component and cannot export metadata, so its title,
// description and canonical live here. Without this it inherited the site-wide default
// and was indistinguishable from seven other pages in search results.
export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'The terms under which railway contractors use IR-PVC to calculate Price Variation Clause bills and generate GCC-compliant reports.',
  alternates: { canonical: '/terms' },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
