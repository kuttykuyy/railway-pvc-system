import type { ReactNode } from 'react';

export interface FaqItem {
  q: string;
  /** Plain-text answer used for the structured data; keep it self-contained. */
  a: string;
}

/**
 * A frequently-asked-questions block that also emits FAQPage structured data.
 *
 * The JSON-LD lets Google show these questions and answers directly in the search
 * result, which is both a ranking signal and real estate on the page — and the
 * visible list is genuine content a crawler indexes, which is what "crawled,
 * currently not indexed" pages were short of.
 */
export function Faq({ heading = 'Frequently asked questions', items }: { heading?: string; items: FaqItem[] }) {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((it) => ({
      '@type': 'Question',
      name: it.q,
      acceptedAnswer: { '@type': 'Answer', text: it.a },
    })),
  };
  return (
    <section aria-labelledby="faq-heading" className="mx-auto max-w-3xl">
      <h2 id="faq-heading" className="text-2xl font-bold tracking-tight text-slate-900">{heading}</h2>
      <dl className="mt-6 divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
        {items.map((it, i) => (
          <div key={i} className="p-5">
            <dt className="text-[15px] font-semibold text-slate-900">{it.q}</dt>
            <dd className="mt-1.5 text-[15px] leading-relaxed text-slate-600">{it.a}</dd>
          </div>
        ))}
      </dl>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </section>
  );
}

/** A titled prose block — a heading and paragraphs/children, spaced for reading. */
export function ContentSection({ id, title, children }: { id?: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="mx-auto max-w-3xl">
      <h2 id={id} className="text-2xl font-bold tracking-tight text-slate-900">{title}</h2>
      <div className="mt-4 space-y-4 text-[15px] leading-relaxed text-slate-600">{children}</div>
    </section>
  );
}
