import type { Metadata } from 'next';

// The page itself is a client component and cannot export metadata, so its title,
// description and canonical live here. Without this it inherited the site-wide default
// and was indistinguishable from seven other pages in search results.
export const metadata: Metadata = {
  title: 'Welcome to IR-PVC',
  description: 'Your IR-PVC account is ready. Set up your first contract and bill.',
  alternates: { canonical: '/welcome' },
  // A post-signup landing page: nothing for a search engine here.
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
