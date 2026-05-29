
import { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = 'https://irpvc.in';
  
  // Public pages (accessible without login)
  const publicPages = [
    { route: '', priority: 1.0, changeFrequency: 'daily' as const },
    { route: '/about', priority: 0.9, changeFrequency: 'monthly' as const },
    { route: '/pricing', priority: 0.9, changeFrequency: 'weekly' as const },
    { route: '/contact', priority: 0.8, changeFrequency: 'monthly' as const },
    { route: '/privacy', priority: 0.5, changeFrequency: 'yearly' as const },
    { route: '/terms', priority: 0.5, changeFrequency: 'yearly' as const },
    { route: '/auth/signin', priority: 0.8, changeFrequency: 'monthly' as const },
    { route: '/auth/signup', priority: 0.8, changeFrequency: 'monthly' as const },
  ];

  // Protected pages (require login - lower priority for SEO)
  const protectedPages = [
    { route: '/dashboard', priority: 0.7, changeFrequency: 'daily' as const },
    { route: '/contracts', priority: 0.7, changeFrequency: 'daily' as const },
    { route: '/bills', priority: 0.7, changeFrequency: 'daily' as const },
    { route: '/classifications', priority: 0.6, changeFrequency: 'weekly' as const },
    { route: '/indices', priority: 0.6, changeFrequency: 'daily' as const },
    { route: '/reports/abstract', priority: 0.6, changeFrequency: 'weekly' as const },
    { route: '/pvc-forecast', priority: 0.7, changeFrequency: 'daily' as const },

    { route: '/profile', priority: 0.5, changeFrequency: 'monthly' as const },
    { route: '/help', priority: 0.7, changeFrequency: 'monthly' as const },
  ];

  const allPages = [...publicPages, ...protectedPages];

  const sitemap: MetadataRoute.Sitemap = allPages.map((page) => ({
    url: `${baseUrl}${page.route}`,
    lastModified: new Date(),
    changeFrequency: page.changeFrequency,
    priority: page.priority,
  }));

  return sitemap;
}
