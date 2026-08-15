
import { MetadataRoute } from 'next';

import { SITE_ORIGIN } from './sitemap';

export default function robots(): MetadataRoute.Robots {
  // www, matching where the site is actually served — the bare domain redirects here.
  const baseUrl = SITE_ORIGIN;
  
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',
          '/admin/',
          '/_next/',
          '/private/',
          '/*.json$',
          '/sw.js',
        ],
      },
      {
        userAgent: 'Googlebot',
        allow: '/',
        disallow: [
          '/api/',
          '/admin/',
          '/_next/',
          '/private/',
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  };
}
