
import { MetadataRoute } from 'next';

/**
 * The site is served from www.irpvc.in — the bare domain 307-redirects to it. The
 * sitemap advertised the bare domain, so every URL in it redirected, which is what
 * Search Console reports as "Page with redirect", and it left Google holding two
 * addresses for one page with nothing to say which is canonical.
 */
export const SITE_ORIGIN = 'https://www.irpvc.in';

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = SITE_ORIGIN;

  // Public pages (accessible without login). Sign-in and sign-up are deliberately not
  // here: they are noindex (app/auth/layout.tsx), and listing them at 0.8 put two login
  // forms above the product pages. Try-bill, the page that converts, was missing.
  const publicPages = [
    { route: '', priority: 1.0, changeFrequency: 'weekly' as const },
    { route: '/try-bill', priority: 0.9, changeFrequency: 'monthly' as const },
    { route: '/pricing', priority: 0.9, changeFrequency: 'monthly' as const },
    { route: '/how-it-works', priority: 0.9, changeFrequency: 'monthly' as const },
    { route: '/about', priority: 0.7, changeFrequency: 'monthly' as const },
    { route: '/help', priority: 0.7, changeFrequency: 'monthly' as const },
    { route: '/getting-started', priority: 0.7, changeFrequency: 'monthly' as const },
    { route: '/payment-guide', priority: 0.6, changeFrequency: 'monthly' as const },
    { route: '/contact', priority: 0.6, changeFrequency: 'yearly' as const },
    { route: '/privacy', priority: 0.3, changeFrequency: 'yearly' as const },
    { route: '/terms', priority: 0.3, changeFrequency: 'yearly' as const },
    { route: '/refund', priority: 0.3, changeFrequency: 'yearly' as const },
  ];

  // One date for the lot, moved by hand when the public pages change. It used to be
  // "now" on every request, which told Google every page changed every minute — a
  // signal it learns to ignore, taking the real changes down with it.
  const LAST_MODIFIED = new Date('2026-09-02T00:00:00Z');

  // Pages behind the login are deliberately NOT listed. A sitemap is a list of pages
  // that can be indexed, and every one of these answers a crawler with a redirect to
  // the sign-in page — which is the other half of what Search Console is reporting.
  // Listing them cannot help ranking either: Google never sees their content.
  const loginOnlyPagesNotListed = [
    { route: '/dashboard', priority: 0.7, changeFrequency: 'daily' as const },
    { route: '/contracts', priority: 0.7, changeFrequency: 'daily' as const },
    { route: '/bills', priority: 0.7, changeFrequency: 'daily' as const },
    { route: '/classifications', priority: 0.6, changeFrequency: 'weekly' as const },
    { route: '/indices', priority: 0.6, changeFrequency: 'daily' as const },
    { route: '/reports/abstract', priority: 0.6, changeFrequency: 'weekly' as const },

    { route: '/profile', priority: 0.5, changeFrequency: 'monthly' as const },
    { route: '/help', priority: 0.7, changeFrequency: 'monthly' as const },
  ];

  void loginOnlyPagesNotListed; // kept as documentation of what is excluded, and why
  const allPages = publicPages;

  const sitemap: MetadataRoute.Sitemap = allPages.map((page) => ({
    url: `${baseUrl}${page.route}`,
    lastModified: LAST_MODIFIED,
    changeFrequency: page.changeFrequency,
    priority: page.priority,
  }));

  return sitemap;
}
