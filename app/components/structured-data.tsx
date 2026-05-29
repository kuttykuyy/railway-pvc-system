
'use client';

import Script from 'next/script';

export default function StructuredData() {
  const organizationSchema = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Southern Railway Contractors Association - Tiruchirappalli Division',
    alternateName: 'IR-PVC System',
    url: 'https://irpvc.in',
    logo: 'https://irpvc.in/icons/icon-512x512.png',
    description: 'Leading provider of Indian Railway Price Variation Clause (PVC) calculation and contract management software for railway contractors across India',
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
      availableLanguage: ['English', 'Hindi'],
      areaServed: 'IN',
    },
  };

  const websiteSchema = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'IR-PVC - Indian Railway Price Variation Clause Calculator',
    alternateName: 'IR-PVC System',
    url: 'https://irpvc.in',
    description: 'Complete PVC calculation system for Indian Railway contracts. Automate bill generation, track price indices, manage contracts, and generate GCC-compliant reports.',
    inLanguage: 'en-IN',
    publisher: {
      '@type': 'Organization',
      name: 'Southern Railway Contractors Association - Tiruchirappalli Division',
      url: 'https://irpvc.in',
    },
  };

  const softwareSchema = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'IR-PVC System',
    applicationCategory: 'BusinessApplication',
    applicationSubCategory: 'Contract Management Software',
    operatingSystem: 'Web Browser, iOS, Android',
    browserRequirements: 'Requires JavaScript. Requires HTML5.',
    softwareVersion: '2.0',
    datePublished: '2023-01-01',
    dateModified: new Date().toISOString(),
    author: {
      '@type': 'Organization',
      name: 'Southern Railway Contractors Association - Tiruchirappalli Division',
      url: 'https://irpvc.in',
    },
    offers: {
      '@type': 'Offer',
      price: '1',
      priceCurrency: 'INR',
      description: 'Flexible pricing starting at ₹1 per bill calculation with free trial available',
      availability: 'https://schema.org/InStock',
      url: 'https://irpvc.in/pricing',
    },
    description: 'Comprehensive Price Variation Clause calculation system for Indian Railway contractors. Automate PVC calculations, generate bills, track price indices, and ensure GCC compliance.',
    featureList: [
      'Automated PVC Calculations',
      'Bill Generation',
      'Price Index Tracking',
      'GCC Compliance',
      'Contract Management',
      'Multi-bill Reports',
      'WhatsApp Integration',
      'GST Invoicing',
    ],
    screenshot: 'https://irpvc.in/icons/icon-512x512.png',
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: '4.8',
      ratingCount: '150',
      bestRating: '5',
      worstRating: '1',
    },
    review: {
      '@type': 'Review',
      reviewRating: {
        '@type': 'Rating',
        ratingValue: '5',
        bestRating: '5',
      },
      author: {
        '@type': 'Person',
        name: 'Railway Contractor',
      },
      reviewBody: 'Excellent tool for managing PVC calculations and railway contracts. Saves hours of manual work.',
    },
  };

  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: 'https://irpvc.in',
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Dashboard',
        item: 'https://irpvc.in/dashboard',
      },
    ],
  };

  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: 'What is PVC in Indian Railways?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'PVC (Price Variation Clause) is a provision in railway contracts that allows price adjustments based on changes in material and labor costs during contract execution, as per GCC norms.',
        },
      },
      {
        '@type': 'Question',
        name: 'How does IR-PVC calculate price variations?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'IR-PVC automatically calculates price variations using official price indices, contract base rates, and measurement dates according to GCC compliance formulas.',
        },
      },
      {
        '@type': 'Question',
        name: 'Is the system suitable for railway contractors?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Yes, IR-PVC is specifically designed for Indian Railway contractors to automate PVC calculations, manage contracts, generate bills, and ensure GCC compliance.',
        },
      },
    ],
  };

  return (
    <>
      <Script
        id="organization-schema"
        type="application/ld+json"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
      />
      <Script
        id="website-schema"
        type="application/ld+json"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteSchema) }}
      />
      <Script
        id="software-schema"
        type="application/ld+json"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareSchema) }}
      />
      <Script
        id="breadcrumb-schema"
        type="application/ld+json"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />
      <Script
        id="faq-schema"
        type="application/ld+json"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
    </>
  );
}
