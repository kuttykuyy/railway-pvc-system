import type { Metadata } from 'next';
import { Walkthrough } from '@/components/how-it-works/walkthrough';

export const metadata: Metadata = {
  title: 'How it works — contract to PVC report in two uploads | IR-PVC',
  description:
    'A step-by-step walkthrough of IR-PVC: upload the LOA to add your contract, upload the signed IREPS bill, and the price variation report is prepared — in English and Hindi.',
  alternates: { canonical: '/how-it-works' },
};

/**
 * Public — a new user should be able to watch this BEFORE signing up, and a
 * contractor should be able to send the link to a colleague who has never seen
 * the app. The middleware lists it among the pages served without a session.
 */
export default function HowItWorksPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-emerald-50/30 to-emerald-50/50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-6">
        <header className="space-y-2">
          <p className="font-mono text-xs tracking-[.14em] uppercase text-emerald-700">www.irpvc.in</p>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900 text-balance">
            Contract to report, in two uploads
          </h1>
          <p className="text-slate-600 max-w-[58ch]">
            How to add your contract and create your first bill. Press play — each step shows the real screen you will see.
          </p>
        </header>
        <Walkthrough />
      </div>
    </div>
  );
}
