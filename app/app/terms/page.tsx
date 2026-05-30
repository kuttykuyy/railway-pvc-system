'use client';

import { BackButton } from '@/components/ui/back-button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FileText, Sparkles, Building2, Mail, Phone, Calendar, CheckCircle } from 'lucide-react';

export default function TermsAndConditionsPage() {
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
                <FileText className="h-7 w-7" />
              </div>
              <div>
                <CardTitle className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                  Terms and Conditions
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
                1. Acceptance of Terms
              </h3>
              <p>
                By accessing and using the <strong className="text-slate-900 font-bold">Indian Railway PVC Bill Management System (irpvc.in)</strong>, you agree to be bound by these Terms and Conditions. If you do not agree with any part of these terms, you must discontinue using our services immediately.
              </p>
            </section>

            <section className="space-y-3">
              <h3 className="text-lg font-black text-slate-800 tracking-tight flex items-center gap-2">
                <span className="w-1 h-5 bg-blue-500 rounded-full" />
                2. Service Description
              </h3>
              <p>
                We provide a professional automated platform for calculating Price Variation Clause (PVC) amounts for Indian Railway contracts under GCC rules. Our services include:
              </p>
              <ul className="list-disc pl-6 space-y-1 text-slate-600 text-sm">
                <li>Automated calculations compliant with GCC-2022 and historical guidelines</li>
                <li>Comprehensive running account bill management and ledger tracking</li>
                <li>PDF format calculations sheet ready for submission to divisional audits</li>
                <li>Index trend visual analytics for PPAC fuel, steel JPC, and cement indices</li>
              </ul>
            </section>

            <section className="space-y-3">
              <h3 className="text-lg font-black text-slate-800 tracking-tight flex items-center gap-2">
                <span className="w-1 h-5 bg-blue-500 rounded-full" />
                3. User Accounts
              </h3>
              <p>
                To utilize our PVC calculation engine, you are required to register an account. You must maintain the strict confidentiality of your credentials and accept sole responsibility for all actions performed under your active session.
              </p>
            </section>

            <section className="space-y-3">
              <h3 className="text-lg font-black text-slate-800 tracking-tight flex items-center gap-2">
                <span className="w-1 h-5 bg-blue-500 rounded-full" />
                4. Credit Structure & Volume Rates
              </h3>
              <p>
                Our billing operates on a prepaid credit deduction format:
              </p>
              <ul className="list-disc pl-6 space-y-1 text-slate-600 text-sm">
                <li><strong className="text-slate-800">Free Trial:</strong> New accounts receive one free bill credit upon registration.</li>
                <li><strong className="text-slate-800">Rates per Bill:</strong> Pricing operates on a volume scale: ₹199 per bill for Standard Volume, ₹159 per bill for Medium Volume, and ₹119 per bill for High Volume.</li>
                <li><strong className="text-slate-800">Exempt Tiers:</strong> Verified Railway Officials receive fully exempt, zero-charge calculation and oversight plans.</li>
                <li><strong className="text-slate-800">Manual Top-ups:</strong> Credits are added manually after payment verification by our divisional administrator.</li>
              </ul>
            </section>

            <section className="space-y-3">
              <h3 className="text-lg font-black text-slate-800 tracking-tight flex items-center gap-2">
                <span className="w-1 h-5 bg-blue-500 rounded-full" />
                5. Use of Service & Restrictions
              </h3>
              <p>
                You agree not to attempt to reverse engineer the calculation engine, bypass credit deductions, upload malicious files, input deliberately fraudulent contract statistics, or use automated scripts to scrap index databases.
              </p>
            </section>

            <section className="space-y-3">
              <h3 className="text-lg font-black text-slate-800 tracking-tight flex items-center gap-2">
                <span className="w-1 h-5 bg-blue-500 rounded-full" />
                6. Accuracy & Calculations Responsibility
              </h3>
              <p>
                While our system is meticulously verified against GCC rules, <strong className="text-slate-800">it remains an administrative tool.</strong> Final billing accuracy, verification of index items, and compliance checks remain the ultimate responsibility of the contractor and compiling officials before formal submission.
              </p>
            </section>

            <section className="space-y-3">
              <h3 className="text-lg font-black text-slate-800 tracking-tight flex items-center gap-2">
                <span className="w-1 h-5 bg-blue-500 rounded-full" />
                7. Limitation of Liability
              </h3>
              <p>
                We shall not be liable for any indirect, special, incidental, or financial damages resulting from incorrect index data inputs, calculation discrepancies, or audit delay penalties arising from the use of our generated reports.
              </p>
            </section>

            <section className="space-y-4">
              <h3 className="text-lg font-black text-slate-800 tracking-tight flex items-center gap-2">
                <span className="w-1 h-5 bg-blue-500 rounded-full" />
                8. Contact Information
              </h3>
              <p>
                For any questions or clarification regarding these Terms, please contact our administrator:
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
                These Terms and Conditions shall be governed by and construed in accordance with the laws of India. Any disputes arising from these terms shall be subject to the exclusive jurisdiction of the courts in Tamil Nadu, India.
              </p>
            </section>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
