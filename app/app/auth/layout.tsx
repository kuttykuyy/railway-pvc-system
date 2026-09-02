import type { Metadata } from 'next';

// Sign-in, sign-up and password-reset pages are not search results. They were indexable
// and listed in the sitemap at priority 0.8, above the product pages; the sitemap now
// leaves them out and this keeps them out of the index.
export const metadata: Metadata = {
  title: 'Sign in',
  robots: { index: false, follow: true },
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
