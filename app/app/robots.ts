
import { MetadataRoute } from 'next';

import { SITE_ORIGIN } from './sitemap';

export default function robots(): MetadataRoute.Robots {
  // www, matching where the site is actually served — the bare domain redirects here.
  const baseUrl = SITE_ORIGIN;
  
  // /_next/ is deliberately NOT blocked. It holds the JavaScript and CSS, and a
  // crawler that cannot fetch those cannot render the page — which matters here
  // because several pages, signup among them, render on the client and arrive as an
  // empty skeleton without their scripts. Google asks for these to stay crawlable.
  //
  // Nor is /*.json$, which matched only /manifest.json — the file every page links to
  // for the install prompt. Everything else that answers JSON lives under /api/.
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',
          '/admin/',
          '/private/',
          '/sw.js',
        ],
      },
      {
        userAgent: 'Googlebot',
        allow: '/',
        disallow: [
          '/api/',
          '/admin/',
          '/private/',
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  };
}
