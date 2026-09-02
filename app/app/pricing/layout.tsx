import type { Metadata } from 'next';

// The page itself is a client component and cannot export metadata, so its title,
// description and canonical live here. Without this it inherited the site-wide default
// and was indistinguishable from seven other pages in search results.
export const metadata: Metadata = {
  title: 'Pricing: pay per PVC bill, first bill free',
  description: 'IR-PVC pricing for Indian Railway contractors: Rs 199 per manually entered bill, Rs 499 per AI-read PDF bill, first bill free. No subscription, credits never expire.',
  alternates: { canonical: '/pricing' },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
