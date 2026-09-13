import Link from 'next/link';
import { Faq, ContentSection } from './faq';

/**
 * Readable content beneath the interactive walkthrough on /how-it-works. The player is
 * mostly client-rendered mock screens, so this gives the page the indexable text — the
 * two-upload process in words, plus a HowTo structured-data block for a rich result.
 */
export function HowItWorksContent() {
  const howToJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: 'How to calculate a railway PVC bill with IR-PVC',
    description:
      'Add your contract from its Letter of Acceptance, upload the signed IREPS running-account bill, and download the GCC-2022 Clause 46A price variation statement.',
    step: [
      { '@type': 'HowToStep', name: 'Add your contract', text: 'Upload the Letter of Acceptance (LOA) PDF. IR-PVC reads the agreement number, tender closing date, base month, schedules and rates automatically.' },
      { '@type': 'HowToStep', name: 'Upload the signed bill', text: 'Upload the signed IREPS running-account bill. Every item, quantity and rate is read and checked against the bill’s own printed total.' },
      { '@type': 'HowToStep', name: 'Get the PVC statement', text: 'The price variation is computed under GCC-2022 Clause 46A and the statement is prepared in the Railway’s format, ready to download and share on WhatsApp.' },
    ],
  };
  return (
    <div className="mx-auto max-w-4xl space-y-14 px-4 pb-16 pt-10">
      <ContentSection id="two-uploads" title="Contract to PVC report in two uploads">
        <p>
          IR-PVC turns two PDFs into a finished Price Variation Clause statement. You add the contract once
          from its Letter of Acceptance, then upload each running bill as it is passed. There is nothing to
          type item by item — the app reads the documents the Railway already gave you.
        </p>
      </ContentSection>

      <ContentSection id="step-1" title="Step 1 — add your contract from the LOA">
        <p>
          Upload the Letter of Acceptance (LOA) PDF. IR-PVC reads the agreement number, the tender closing
          date (which fixes the base month for the whole contract), the completion period, the schedules and
          their rates, and the accepted tender percentage. A contract set up from an LOA stands on its LOA
          number until its first bill supplies the full agreement number, so nothing is lost either way.
        </p>
      </ContentSection>

      <ContentSection id="step-2" title="Step 2 — upload the signed bill">
        <p>
          Upload the signed IREPS running-account bill. Every payable item is read with its quantity, agreement
          rate and amount, and the total is reconciled against the bill&rsquo;s own printed figure to the paisa —
          if they do not match, the bill is not guessed at. Cement and steel items are recognised so they are
          priced on their own indices, and items added after the agreement are set outside price variation
          automatically. If a bill is a scan with no text, you can fill it on a simple four-column spreadsheet
          instead, or type it in.
        </p>
      </ContentSection>

      <ContentSection id="the-report" title="The PVC statement you get">
        <p>
          The price variation is computed under GCC-2022 Clause 46A, component by component — labour, plant and
          machinery, fuel, cement, steel and other materials — each against its published index, with the parts
          added to the bill&rsquo;s total and the running cumulative carried forward. The statement is produced in
          the Railway&rsquo;s own format, in English or Hindi, with the indices annexed, ready to download as a PDF and
          send on WhatsApp.
        </p>
      </ContentSection>

      <Faq
        items={[
          { q: 'Do I need to enter items by hand?', a: 'No. Upload the signed IREPS bill and every item, quantity, rate and amount is read from the PDF and checked against the bill’s printed total. Manual entry and a spreadsheet upload are there as fallbacks for scanned bills.' },
          { q: 'What documents do I upload?', a: 'Two: the Letter of Acceptance (LOA) to add the contract once, and the signed IREPS running-account bill for each bill you want a PVC statement for.' },
          { q: 'Is the report in the Railway’s official format?', a: 'Yes. The statement follows GCC-2022 Clause 46A with the component breakup and the published indices annexed, in the layout an executive and the accounts office expect, available in English and Hindi.' },
          { q: 'How long does it take?', a: 'A running bill’s statement is prepared in about a minute from the upload — the reading and the reconciliation are automatic.' },
          { q: 'Can I share it on WhatsApp?', a: 'Yes. The finished PVC statement is delivered in the app and sent to the WhatsApp number on your account, so it reaches you and your office directly.' },
        ]}
      />

      <div className="mx-auto max-w-3xl rounded-2xl bg-emerald-600 px-6 py-8 text-center">
        <h2 className="text-xl font-bold text-white">Try it on your own bill</h2>
        <p className="mx-auto mt-2 max-w-[52ch] text-emerald-50">
          Calculate a PVC amount free with no account, or sign up and your first full bill is free.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          <Link href="/try-bill" className="inline-flex items-center rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-50">Try the free calculator</Link>
          <Link href="/auth/signup" className="inline-flex items-center rounded-lg border border-white/60 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500">Create a free account</Link>
        </div>
      </div>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(howToJsonLd) }} />
    </div>
  );
}
