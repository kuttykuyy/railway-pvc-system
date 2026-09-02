import { SITE_ORIGIN } from '@/app/sitemap';

/**
 * Schema.org data for the site, rendered into the HTML on the server.
 *
 * This was a client component that injected the JSON-LD with next/script after
 * hydration, so the HTML a crawler fetched carried none of it. It also published an
 * aggregate rating (4.8 from 150 ratings) and a five-star review by "Railway Contractor"
 * that exist nowhere on the site — invented ratings are the one structured-data offence
 * Google acts on with a manual penalty, and they are gone. The FAQ block is gone too:
 * Google stopped showing FAQ rich results for commercial sites in 2023, and a sitewide
 * FAQ on every page said nothing true about any of them. Breadcrumbs likewise: a
 * sitewide trail of Home > Dashboard pointed at a login-only page.
 *
 * What remains is what is true and useful: who runs the site, what the site is, and
 * what the software costs.
 */
const ORGANIZATION = 'Southern Railway Contractors Association - Tiruchirappalli Division';

export default function StructuredData() {
  const organizationSchema = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: ORGANIZATION,
    alternateName: 'IR-PVC System',
    url: SITE_ORIGIN,
    logo: `${SITE_ORIGIN}/icons/icon-512x512.png`,
    description: 'Provider of the IR-PVC Price Variation Clause (PVC) calculation and contract management software for Indian Railway contractors.',
    foundingDate: '2023',
    address: {
      '@type': 'PostalAddress',
      addressCountry: 'IN',
      addressRegion: 'Tamil Nadu',
      addressLocality: 'Tiruchirappalli',
    },
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'Customer Support',
      url: `${SITE_ORIGIN}/contact`,
      availableLanguage: ['English', 'Hindi'],
      areaServed: 'IN',
    },
  };

  const websiteSchema = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'IR-PVC - Indian Railway Price Variation Clause Calculator',
    alternateName: 'IR-PVC System',
    url: SITE_ORIGIN,
    description: 'PVC calculation system for Indian Railway contracts: bill generation, price index tracking, contract management and GCC-compliant reports.',
    inLanguage: 'en-IN',
    publisher: { '@type': 'Organization', name: ORGANIZATION, url: SITE_ORIGIN },
  };

  const softwareSchema = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'IR-PVC System',
    applicationCategory: 'BusinessApplication',
    applicationSubCategory: 'Contract Management Software',
    operatingSystem: 'Web Browser, iOS, Android',
    browserRequirements: 'Requires JavaScript. Requires HTML5.',
    url: SITE_ORIGIN,
    author: { '@type': 'Organization', name: ORGANIZATION, url: SITE_ORIGIN },
    offers: {
      '@type': 'Offer',
      price: '199',
      priceCurrency: 'INR',
      description: 'Pay-as-you-go credits: Rs 199 per manually entered bill or Rs 499 per AI-read PDF bill. First bill free for new users.',
      availability: 'https://schema.org/InStock',
      url: `${SITE_ORIGIN}/pricing`,
    },
    description: 'Price Variation Clause calculation system for Indian Railway contractors: automated PVC calculations, bill generation, price index tracking and GCC compliance.',
    featureList: [
      'Automated PVC Calculations',
      'Bill Generation',
      'Price Index Tracking',
      'GCC Compliance',
      'Contract Management',
      'Multi-bill Reports',
      'WhatsApp and Telegram Integration',
      'GST Invoicing',
    ],
    screenshot: `${SITE_ORIGIN}/og-image.png`,
  };

  const schemas = [organizationSchema, websiteSchema, softwareSchema];
  return (
    <>
      {schemas.map((schema, index) => (
        <script
          key={index}
          type="application/ld+json"
          // Serialised JSON from constants above — no user input reaches this string.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g, '\\u003c') }}
        />
      ))}
    </>
  );
}
