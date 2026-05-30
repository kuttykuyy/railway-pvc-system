'use client';

import { BackButton } from '@/components/ui/back-button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RefreshCw, Sparkles, Building2, Mail, Phone, Calendar, Info } from 'lucide-react';

export default function RefundPolicyPage() {
  return (
    <div className="relative min-h-screen pb-16 space-y-8 overflow-hidden bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/50">
      {/* Decorative Light Backdrops */}
      <div className="absolute top-0 right-10 w-96 h-96 bg-blue-300/10 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute top-1/3 -left-20 w-80 h-80 bg-indigo-300/10 blur-[100px] rounded-full pointer-events-none" />
      <div className="absolute bottom-10 right-20 w-[450px] h-[450px] bg-purple-300/5 blur-[150px] rounded-full pointer-events-none" />

      <div className="container mx-auto px-4 py-8 max-w-4xl relative z-10 space-y-8">
        <BackButton href="/" variant="outline" className="mb-4 border-slate-200/80 bg-white/80 hover:bg-slate-50 text-slate-600 hover:text-slate-800" />
        
        <Card className="border border-slate-100 bg-white/70 backdrop-blur-md shadow-[0_15px_35px_rgba(0,0,0,0.02)] rounded-3xl overflow-hidden">
          <CardHeader className="p-8 sm:p-10 border-b border-slate-100 bg-gradient-to-r from-blue-500/5 to-indigo-500/5">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-blue-50 border border-blue-100 rounded-2xl text-blue-600">
                <RefreshCw className="h-7 w-7 animate-spin-slow" />
              </div>
              <div>
                <CardTitle className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                  Cancellation & Refund Policy
                </CardTitle>
                <div className="flex items-center gap-2 text-xs text-slate-400 mt-1 font-medium">
                  <Calendar className="h-3.5 w-3.5 text-slate-400" />
                  Last Updated: October 26, 2025
                </div>
              </div>
            </div>
          </CardHeader>
          
          <CardContent className="p-8 sm:p-10 prose prose-slate max-w-none space-y-8 text-slate-600 leading-relaxed text-sm sm:text-base">
            <section className="space-y-3">
              <h3 className="text-lg font-black text-slate-800 tracking-tight flex items-center gap-2">
                <span className="w-1 h-5 bg-blue-500 rounded-full" />
                1. Service Nature
              </h3>
              <p>
                The <strong className="text-slate-900 font-bold">Indian Railway PVC Bill Management System (IR-PVC)</strong> provides specialized digital bill processing, PVC calculations, and PDF generation services on a prepaid credit-based system. Once a bill is calculated and its calculation sheets are generated, the digital service is considered fully delivered and the associated credits are deducted.
              </p>
            </section>

            <section className="space-y-3">
              <h3 className="text-lg font-black text-slate-800 tracking-tight flex items-center gap-2">
                <span className="w-1 h-5 bg-blue-500 rounded-full" />
                2. No Cancellation After Processing
              </h3>
              <p>
                Due to the automated and instant calculation of GCC bills on our servers, once you submit a bill interval for calculation:
              </p>
              <ul className="list-disc pl-6 space-y-1 text-slate-600 text-sm">
                <li>The PVC compilation engine processes calculations and fetches WPI/JPC indices immediately.</li>
                <li>Associated credits are deducted upon successful calculation sheet generation.</li>
                <li>Processed bills are fully downloadable and cannot be canceled, reversed, or refunded.</li>
                <li>You can delete or modify drafts freely before clicking the final submit calculation action.</li>
              </ul>
            </section>

            <section className="space-y-3">
              <h3 className="text-lg font-black text-slate-800 tracking-tight flex items-center gap-2">
                <span className="w-1 h-5 bg-blue-500 rounded-full" />
                3. Credit Purchases and Top-ups
              </h3>
              <p>
                To process bills beyond the initial free trial limit:
              </p>
              <ul className="list-disc pl-6 space-y-1 text-slate-600 text-sm">
                <li>Credits must be purchased by coordinating with our division administrator.</li>
                <li>Payments are processed manually via bank transfer, UPI, or standard options as specified by the admin.</li>
                <li>Credits do not carry an expiration date and remain valid inside your account indefinitely.</li>
              </ul>
            </section>

            <section className="space-y-4">
              <h3 className="text-lg font-black text-slate-800 tracking-tight flex items-center gap-2">
                <span className="w-1 h-5 bg-blue-500 rounded-full" />
                4. Refund Eligibility
              </h3>
              <p>
                Refunds or credit adjustments are strictly limited to the following technical scenarios:
              </p>
              
              <div className="grid md:grid-cols-2 gap-6 pt-2">
                <div className="p-5 bg-slate-50/60 border border-slate-100 rounded-2xl space-y-2">
                  <h4 className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
                    <Info className="h-4 w-4 text-blue-500" /> Technical Glitches
                  </h4>
                  <ul className="list-disc pl-4 space-y-1 text-xs text-slate-500">
                    <li>System crash leading to double credit deduction.</li>
                    <li>Credits deducted but PDF download failed.</li>
                    <li>Calculation engine failure preventing report generation.</li>
                  </ul>
                </div>

                <div className="p-5 bg-slate-50/60 border border-slate-100 rounded-2xl space-y-2">
                  <h4 className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
                    <Info className="h-4 w-4 text-indigo-500" /> Payment Discrepancies
                  </h4>
                  <ul className="list-disc pl-4 space-y-1 text-xs text-slate-500">
                    <li>Double payment for the exact same credit bundle.</li>
                    <li>Payment confirmed but credits not added within 48 hours.</li>
                    <li>Inconsistent credit amount allocated compared to payment.</li>
                  </ul>
                </div>
              </div>
            </section>

            <section className="space-y-3">
              <h3 className="text-lg font-black text-slate-800 tracking-tight flex items-center gap-2">
                <span className="w-1 h-5 bg-blue-500 rounded-full" />
                5. Non-Refundable Scenarios
              </h3>
              <p>
                Refunds or credit reversals will not be granted for user-compilation errors (such as entering incorrect contract numbers, wrong items classifications, or wrong bill dates) or in cases of change of mind after successful sheet generation.
              </p>
            </section>

            <section className="space-y-3">
              <h3 className="text-lg font-black text-slate-800 tracking-tight flex items-center gap-2">
                <span className="w-1 h-5 bg-blue-500 rounded-full" />
                6. Refund & Dispute Process
              </h3>
              <p>
                To open a billing dispute or request technical credit reversals, please contact our administrator within 7 days of the transaction. Provide your name, account email, transaction details, and description of the error. Approved credit adjustments will be added back to your balance immediately, and monetary refunds will be sent back via bank transfer within 10-14 business days.
              </p>
            </section>

            <section className="space-y-4">
              <h3 className="text-lg font-black text-slate-800 tracking-tight flex items-center gap-2">
                <span className="w-1 h-5 bg-blue-500 rounded-full" />
                7. Contact Information
              </h3>
              <p>
                For refund requests or billing discrepancies, please contact our administrator:
              </p>
              
              <div className="p-6 bg-slate-50/60 border border-slate-100 rounded-2xl max-w-md space-y-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-100 text-blue-700 rounded-lg">
                    <Building2 className="h-4.5 w-4.5" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 font-light">Division Administrator</p>
                    <p className="text-sm font-bold text-slate-800">Prasath Kumar</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="p-2 bg-indigo-100 text-indigo-700 rounded-lg">
                    <Phone className="h-4.5 w-4.5" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 font-light">Official Phone</p>
                    <a href="tel:+919944776689" className="text-sm font-bold text-indigo-600 hover:underline">+91 9944776689</a>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="p-2 bg-emerald-100 text-emerald-700 rounded-lg">
                    <Mail className="h-4.5 w-4.5" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 font-light">Email Address</p>
                    <a href="mailto:admin@irpvc.in" className="text-sm font-bold text-emerald-600 hover:underline">admin@irpvc.in</a>
                  </div>
                </div>
              </div>
            </section>

            <section className="space-y-3 pt-4 border-t border-slate-100 text-xs text-slate-400 font-light">
              <p>
                This cancellation and refund policy is subject to applicable Indian laws and regulations. Any disputes arising from billing matters shall be subject to the exclusive jurisdiction of the courts in Tamil Nadu, India.
              </p>
            </section>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
