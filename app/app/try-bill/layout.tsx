import type { Metadata } from 'next';

// The page itself is a client component and cannot export metadata, so its title,
// description and canonical live here. Without this it inherited the site-wide default
// and was indistinguishable from seven other pages in search results.
export const metadata: Metadata = {
  title: 'Try IR-PVC free: calculate one PVC bill without an account',
  description: 'Enter a running bill and see its Price Variation Clause amount in seconds, with no sign-up. Your first bill is free when you create an account.',
  alternates: { canonical: '/try-bill' },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
