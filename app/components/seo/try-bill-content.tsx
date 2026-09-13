import Link from 'next/link';
import { Faq, ContentSection } from './faq';

/**
 * The readable content beneath the free calculator on /try-bill. Written for a railway
 * contractor searching "railway PVC calculation" or "price variation clause bill" — real,
 * specific answers, not marketing filler, so the page has something to be indexed for.
 */
export function TryBillContent() {
  return (
    <div className="mx-auto max-w-4xl space-y-14 px-4 pb-16 pt-4">
      <ContentSection id="what-it-does" title="Work out a running bill's PVC in seconds — free, no account">
        <p>
          Price Variation Clause (PVC) pays a railway contractor for the change in material and labour
          prices between the month the work was tendered and the month it was done. It is worked out under
          the General Conditions of Contract 2022, Clause 46A, using the price indices the Railway Board
          publishes each quarter — labour, plant &amp; machinery, fuel, cement, steel and the WPI for other
          materials.
        </p>
        <p>
          The free calculator on this page takes the value of work in your running bill, the base month
          from your agreement, and the measurement month, and returns the PVC amount split by each
          component — the same figures a signed statement would carry. You do not need to log in to see it;
          an account is needed only to download the GCC-format PDF and to save the bill.
        </p>
      </ContentSection>

      <ContentSection id="what-you-need" title="What you need to try it">
        <ul className="list-disc space-y-2 pl-5">
          <li><strong>Base month</strong> — the month before your tender&rsquo;s closing date; PVC is measured from it.</li>
          <li><strong>Measurement month</strong> — when the work in this bill was measured.</li>
          <li><strong>Value of work (W)</strong> — the gross amount of this running bill, excluding any material the Railway supplied free or at a fixed rate, and excluding items added after the agreement (Clause 46A.1(b)).</li>
          <li><strong>Component split</strong> — the Clause 46A weightings for your class of work (building, bridges, permanent way, and so on). The calculator applies the standard shares; you can adjust them.</li>
        </ul>
        <p>
          With the full tool you skip all of this: upload the signed IREPS bill PDF and every item, quantity,
          rate and the base month are read automatically, then checked against the bill&rsquo;s own printed total.
        </p>
      </ContentSection>

      <ContentSection id="how-pvc-is-calculated" title="How the PVC amount is calculated">
        <p>
          For each cost component the formula is <em>Component amount &times; (Index now &minus; Index at base month) &divide;
          Index at base month</em>, where the component amount is the value of work times that component&rsquo;s weight.
          Cement and steel are priced against their own published rates rather than a wholesale index; the
          remaining variable components move with their quarterly index. The parts are added to give the PVC
          for the bill, and the running total across the contract is carried forward.
        </p>
        <p>
          A final bill uses the indices for the month of completion. Items outside price variation — an extra
          item ordered during execution, or material the Railway issued — are listed and paid but earn no PVC,
          exactly as the clause requires.
        </p>
      </ContentSection>

      <Faq
        items={[
          { q: 'Is the PVC calculator really free?', a: 'Yes. You can calculate a running bill’s PVC on this page with no account and no payment. An account is only needed to download the official GCC-format PDF and to keep the bill. Your first bill on a new account is free.' },
          { q: 'What is the base month for PVC?', a: 'The base month is the month before the closing date of the tender. All price indices in the PVC formula are measured as the change from this month, so getting it right is essential. IR-PVC reads it from your Letter of Acceptance automatically.' },
          { q: 'Which indices does the calculation use?', a: 'GCC-2022 Clause 46A uses the Railway Board’s quarterly component indices — labour, plant and machinery, fuel and power, and the WPI for other materials — plus the published rates for cement and for each category of steel (TMT, angles/channels, plates, other sections).' },
          { q: 'Does it work for both provisional and final bills?', a: 'Yes. A running (provisional) bill uses the quarter’s average indices; a final bill uses the indices of the month of completion. Mark the bill as final and give the completion date, and the right indices are applied.' },
          { q: 'Are extra items and railway-supplied material handled?', a: 'Yes. Items added after the agreement under Clause 39 (extra / non-schedule items) and material the Railway supplied free or at a fixed rate are excluded from the value of work the PVC is computed on, as Clause 46A.1(b) requires, while still being paid in full.' },
          { q: 'Can I read the bill from an IREPS PDF instead of typing it?', a: 'Yes, in the full tool. Upload the signed IREPS running-account bill and every item, quantity and rate is read from it, the total is checked against the bill’s printed figure, and the PVC statement is produced in the Railway’s own format.' },
        ]}
      />

      <div className="mx-auto max-w-3xl rounded-2xl bg-emerald-600 px-6 py-8 text-center">
        <h2 className="text-xl font-bold text-white">Your first full bill is free</h2>
        <p className="mx-auto mt-2 max-w-[52ch] text-emerald-50">
          Create an account to upload a signed IREPS bill, download the GCC-format PVC statement, and get it on WhatsApp.
        </p>
        <Link href="/auth/signup" className="mt-5 inline-flex items-center rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-50">
          Create a free account
        </Link>
      </div>
    </div>
  );
}
