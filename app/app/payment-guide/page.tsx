'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  Building2, 
  Mail, 
  Phone, 
  CreditCard, 
  IndianRupee, 
  Loader2, 
  CheckCircle, 
  FileText, 
  Clock 
} from 'lucide-react';
import Link from 'next/link';

interface BillingSettings {
  billCost: number;
  aiBillCost: number;
  freeTrialBills: number;
  freeTrialUsed: number;
  freeTrialRemaining: number;
  isTrialActive: boolean;
  isFreeAccount: boolean;
  customProcessingFee: number | null;
}

export default function PaymentGuidePage() {
  const [billingSettings, setBillingSettings] = useState<BillingSettings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const response = await fetch('/api/billing/settings');
        if (response.ok) {
          const data = await response.json();
          setBillingSettings(data);
        }
      } catch (error) {
        console.error('Error fetching billing settings:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchSettings();
  }, []);

  const effectiveBillCost = billingSettings?.isFreeAccount
    ? 0
    : billingSettings?.customProcessingFee !== null && billingSettings?.customProcessingFee !== undefined
      ? billingSettings.customProcessingFee
      : billingSettings?.billCost || 199;

  // AI PDF auto-extracted bills are charged the AI rate (free/custom-fee accounts still pay 0).
  const effectiveAiBillCost = billingSettings?.isFreeAccount
    ? 0
    : billingSettings?.customProcessingFee !== null && billingSettings?.customProcessingFee !== undefined
      ? billingSettings.customProcessingFee
      : billingSettings?.aiBillCost || 499;

  const freeTrialText = billingSettings?.freeTrialBills === 1 
    ? 'First 1 bill is free (Trial Active)' 
    : `First ${billingSettings?.freeTrialBills || 1} bills are free (Trial Active)`;
  
  return (
    <div className="relative min-h-screen pb-16 space-y-8 overflow-hidden bg-gradient-to-br from-slate-50 via-emerald-50/30 to-emerald-50/50">
      {/* Decorative Light Backdrops */}
      <div className="absolute top-0 right-10 w-96 h-96 bg-emerald-300/10 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute top-1/3 -left-20 w-80 h-80 bg-emerald-300/10 blur-[100px] rounded-full pointer-events-none" />
      <div className="absolute bottom-10 right-20 w-[450px] h-[450px] bg-emerald-300/5 blur-[150px] rounded-full pointer-events-none" />

      <div className="container mx-auto px-4 py-8 max-w-4xl relative z-10 space-y-8">
        
        <Card className="border border-slate-100 bg-white/70 backdrop-blur-md shadow-[0_15px_35px_rgba(0,0,0,0.02)] rounded-3xl overflow-hidden">
          <CardHeader className="p-8 sm:p-10 border-b border-slate-100 bg-gradient-to-r from-emerald-500/5 to-emerald-500/5">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-2xl text-emerald-600">
                <CreditCard className="h-7 w-7" />
              </div>
              <div>
                <CardTitle className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                  Credit Top-up Guide
                </CardTitle>
                <div className="flex items-center gap-2 text-xs text-slate-400 mt-1 font-medium">
                  <Clock className="h-3.5 w-3.5 text-slate-400" />
                  Instant Account Recharge
                </div>
              </div>
            </div>
          </CardHeader>
          
          <CardContent className="p-8 sm:p-10 prose prose-slate max-w-none space-y-8 text-slate-600 leading-relaxed text-sm sm:text-base">
            <section className="space-y-4">
              <h3 className="text-lg font-black text-slate-800 tracking-tight flex items-center gap-2">
                <span className="w-1.5 h-5 bg-emerald-500 rounded-full" />
                1. Contact Division Administrator
              </h3>
              <p>
                To process bills beyond the initial free trial limit, coordinate directly with our Tiruchirappalli Division Administrator to add prepaid credits to your account.
              </p>

              <div className="p-6 bg-slate-50/60 border border-slate-100 rounded-2xl max-w-md space-y-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-emerald-100 text-emerald-700 rounded-lg">
                    <Building2 className="h-4.5 w-4.5" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 font-light">Division Administrator</p>
                    <p className="text-sm font-bold text-slate-800">Prasath Kumar</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="p-2 bg-emerald-100 text-emerald-700 rounded-lg">
                    <Phone className="h-4.5 w-4.5" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 font-light">Official Phone</p>
                    <a href="tel:+919944776689" className="text-sm font-bold text-emerald-600 hover:underline">+91 9944776689</a>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="p-2 bg-emerald-100 text-emerald-700 rounded-lg">
                    <Mail className="h-4.5 w-4.5" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 font-light">Email Address</p>
                    <a href="mailto:admin@illall.in" className="text-sm font-bold text-emerald-600 hover:underline">admin@illall.in</a>
                  </div>
                </div>
              </div>
            </section>

            <section className="space-y-4">
              <h3 className="text-lg font-black text-slate-800 tracking-tight flex items-center gap-2">
                <span className="w-1.5 h-5 bg-emerald-500 rounded-full" />
                2. Pricing & Account Settings
              </h3>
              <p>
                Credits are applied on a pay-as-you-go basis for every bill processed.
              </p>

              <div className="grid md:grid-cols-2 gap-6 pt-2">
                <div className="p-5 bg-slate-50/60 border border-slate-100 rounded-2xl space-y-2">
                  <h4 className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
                    <IndianRupee className="h-4 w-4 text-emerald-500" /> Current Plan Rate
                  </h4>
                  {loading ? (
                    <div className="flex items-center gap-2 text-slate-400 py-2">
                      <Loader2 className="h-4 w-4 animate-spin text-emerald-500" />
                      <span className="text-xs">Loading billing details...</span>
                    </div>
                  ) : billingSettings?.isFreeAccount ? (
                    <div className="space-y-1">
                      <p className="text-sm font-extrabold text-emerald-600">Free Account Tier</p>
                      <p className="text-xs text-slate-500 font-light">Unlimited bills. No processing fees.</p>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <p className="text-sm font-extrabold text-slate-800">
                        ₹{effectiveBillCost.toLocaleString()} <span className="text-xs text-slate-500 font-light">/ manually entered bill</span>
                      </p>
                      <p className="text-sm font-extrabold text-emerald-700">
                        ₹{effectiveAiBillCost.toLocaleString()} <span className="text-xs text-slate-500 font-light">/ AI PDF auto-extracted bill</span>
                      </p>
                      <p className="text-xs text-slate-500 font-light">Charged only when a bill is saved. Same rates apply to bulk creation. {freeTrialText}</p>
                    </div>
                  )}
                </div>

                <div className="p-5 bg-slate-50/60 border border-slate-100 rounded-2xl space-y-2">
                  <h4 className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
                    <CheckCircle className="h-4 w-4 text-emerald-500" /> What is Included
                  </h4>
                  <ul className="list-disc pl-4 space-y-1 text-xs text-slate-500">
                    <li>Full PVC calculations (GCC compliant)</li>
                    <li>Detailed Excel & PDF report generation</li>
                    <li>Automatic price index lookups</li>
                    <li>No monthly commitment or hidden fees</li>
                  </ul>
                </div>
              </div>
            </section>

            <section className="space-y-4">
              <h3 className="text-lg font-black text-slate-800 tracking-tight flex items-center gap-2">
                <span className="w-1.5 h-5 bg-emerald-500 rounded-full" />
                3. Simple Recharge Steps
              </h3>
              <p>
                Follow this quick procedure to top-up your credit balance:
              </p>

              <div className="p-6 bg-slate-50/60 border border-slate-100 rounded-2xl">
                <ol className="space-y-4 text-sm">
                  {[
                    { step: 1, title: 'Initiate Contact', desc: 'Call +91 9944776689 or email admin@illall.in to request credits.' },
                    { step: 2, title: 'Provide Account Details', desc: 'Mention your registered account name and email address.' },
                    { step: 3, title: 'Complete Payment', desc: 'Send payment via bank transfer or UPI as instructed by the administrator.' },
                    { step: 4, title: 'Confirmation', desc: 'Once verified, your credits will be added to your balance immediately.' },
                  ].map((item) => (
                    <li key={item.step} className="flex gap-4">
                      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center text-xs font-black">
                        {item.step}
                      </div>
                      <div className="space-y-0.5">
                        <h5 className="font-bold text-slate-800 text-sm">{item.title}</h5>
                        <p className="text-xs text-slate-500 font-light">{item.desc}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            </section>

            <div className="flex flex-wrap gap-4 pt-4 border-t border-slate-100 justify-end">
              <Link href="/bills/new">
                <Button variant="outline" className="border-slate-200 text-slate-700 hover:bg-slate-50 font-bold px-6 py-2.5 rounded-xl transition-all">
                  <FileText className="h-4.5 w-4.5 mr-2" />
                  Process Bills
                </Button>
              </Link>
              <a href="tel:+919944776689">
                <Button className="bg-gradient-to-r from-emerald-600 to-emerald-600 hover:from-emerald-700 hover:to-emerald-700 text-white font-bold px-6 py-2.5 rounded-xl shadow-md transition-all">
                  <Phone className="h-4.5 w-4.5 mr-2" />
                  Call for Top-up
                </Button>
              </a>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
