import type { Metadata } from 'next';

// The page itself is a client component and cannot export metadata, so its title,
// description and canonical live here. Without this it inherited the site-wide default
// and was indistinguishable from seven other pages in search results.
export const metadata: Metadata = {
  title: 'About IR-PVC and the Southern Railway Contractors Association',
  description: 'Who builds IR-PVC: the Southern Railway Contractors Association, Tiruchirappalli Division, and why railway contractors use it to compute Price Variation Clause bills under the GCC.',
  alternates: { canonical: '/about' },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
