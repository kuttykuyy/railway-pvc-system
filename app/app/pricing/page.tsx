'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Check, IndianRupee, Zap, Building2, Users, Shield, Clock, Award, Sparkles, CheckCircle, Crown, ScanText, PencilLine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export default function PricingPage() {
  const [pricing, setPricing] = useState({ billCost: 199, aiBillCost: 499, freeTrialBills: 1 });

  useEffect(() => {
    fetch('/api/public/pricing')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data) setPricing({ billCost: data.billCost ?? 199, aiBillCost: data.aiBillCost ?? 499, freeTrialBills: data.freeTrialBills ?? 1 }); })
      .catch(() => {});
  }, []);

  return (
    <div className="relative min-h-screen pb-16 space-y-8 overflow-hidden bg-gradient-to-br from-slate-50 via-emerald-50/30 to-emerald-50/50">
      {/* Decorative Light Backdrops */}
      <div className="absolute top-0 right-10 w-96 h-96 bg-emerald-300/10 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute top-1/3 -left-20 w-80 h-80 bg-emerald-300/10 blur-[100px] rounded-full pointer-events-none" />
      <div className="absolute bottom-10 right-20 w-[450px] h-[450px] bg-emerald-300/5 blur-[150px] rounded-full pointer-events-none" />

      <div className="container mx-auto px-4 py-8 max-w-6xl relative z-10 space-y-8">
        
        {/* Header Section */}
        <div className="text-center space-y-4 max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200/50 rounded-full">
            <Sparkles className="h-3 w-3 text-emerald-600 animate-pulse" />
            Flexible Credit Structure
          </div>
          <h1 className="text-4xl sm:text-5xl font-black tracking-tight bg-gradient-to-r from-slate-900 via-emerald-950 to-slate-900 bg-clip-text text-transparent">
            Simple, Transparent Pricing
          </h1>
          <p className="text-sm sm:text-base text-slate-500 font-normal">
            Pay only for what you process with a simple pay-as-you-go credit system. Start with a free trial on your first bill.
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="max-w-xl mx-auto pt-4">
          <Card className="flex flex-col justify-between border border-emerald-200 rounded-3xl transition-all duration-300 relative overflow-hidden bg-gradient-to-b from-emerald-50/50 to-white shadow-[0_20px_50px_rgba(37,99,235,0.08)] hover:shadow-lg">
            <div className="absolute top-0 right-0 bg-emerald-600 text-[10px] text-white font-extrabold px-3.5 py-1 tracking-wider uppercase">
              Pay As You Go
            </div>
            
            <CardHeader className="text-center pb-6 pt-8">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4 border text-emerald-600 bg-emerald-50 border-emerald-100">
                <Zap className="h-6 w-6" />
              </div>
              <CardTitle className="text-xl font-black text-slate-800 mb-2">Standard Plan</CardTitle>
              <p className="text-xs text-slate-500 font-light mb-4">Pay-as-you-go credits — you are charged only when a bill is saved. The rate depends on how you create it:</p>
              <div className="grid grid-cols-2 gap-3 text-left">
                <div className="rounded-2xl border border-slate-200 bg-white p-3">
                  <div className="flex items-center gap-1.5 text-slate-700 text-xs font-semibold mb-1"><PencilLine className="h-3.5 w-3.5" /> Manual entry</div>
                  <div className="flex items-baseline gap-0.5"><IndianRupee className="h-4 w-4 text-emerald-600" /><span className="text-2xl font-black text-emerald-600">{pricing.billCost}</span><span className="text-[10px] text-slate-500 ml-1">/ bill</span></div>
                  <p className="text-[10px] text-slate-500 mt-1">Enter classifications & amounts yourself.</p>
                </div>
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-3">
                  <div className="flex items-center gap-1.5 text-emerald-700 text-xs font-semibold mb-1"><ScanText className="h-3.5 w-3.5" /> AI PDF auto-extract</div>
                  <div className="flex items-baseline gap-0.5"><IndianRupee className="h-4 w-4 text-emerald-600" /><span className="text-2xl font-black text-emerald-600">{pricing.aiBillCost}</span><span className="text-[10px] text-slate-500 ml-1">/ bill</span></div>
                  <p className="text-[10px] text-slate-500 mt-1">Upload the bill PDF; items are read automatically.</p>
                </div>
              </div>
            </CardHeader>
            
            <CardContent className="space-y-6 flex-grow flex flex-col justify-between">
              <ul className="space-y-3.5 text-sm">
                {[
                  'GCC 2022 Compliant calculations',
                  'Unlimited contracts & registries',
                  'Detailed PDF & Excel reports',
                  'Automated WPI/JPC index tracking',
                  'Real-time fuel/steel indices data',
                  'Bulk bill processing support',
                  'Covering letters & abstracts tools',
                  '24/7 dedicated support access',
                ].map((feature, fIdx) => (
                  <li key={fIdx} className="flex items-start gap-2.5">
                    <Check className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <span className="text-slate-600 font-normal text-xs sm:text-sm">{feature}</span>
                  </li>
                ))}
              </ul>
              
              <div className="space-y-3 pt-6 border-t border-slate-100">
                <span className="block text-center text-[10px] font-extrabold px-3 py-1 rounded-lg text-emerald-700 bg-emerald-50">
                  First Bill is FREE (Trial Active)
                </span>
                
                <Link href="/auth/signin?mode=signup" className="block w-full">
                  <Button className="w-full font-bold py-5 rounded-xl transition-all shadow-md bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-500/10">
                    Get Started
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Exemption & CTA Footer */}
        <div className="max-w-3xl mx-auto space-y-6 pt-4">
          <Card className="border border-slate-100 bg-white/70 backdrop-blur-md shadow-[0_15px_35px_rgba(0,0,0,0.02)] rounded-3xl p-6">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-emerald-50 border border-emerald-100 text-emerald-700 rounded-2xl shrink-0">
                <CheckCircle className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <h4 className="font-bold text-slate-800 text-sm">Railway Official & Trial Exemptions</h4>
                <p className="text-xs text-slate-500 leading-relaxed font-light">
                  Your first bill generated is completely free as a trial. Registered Railway Department officials receive 100% free account tiers for administrative calculation audit, compliance checks, and index oversight.
                </p>
              </div>
            </div>
          </Card>

          {/* Bottom Banner */}
          <Card className="border-0 shadow-xl bg-gradient-to-r from-emerald-600 to-emerald-600 text-white rounded-3xl overflow-hidden relative">
            <div className="absolute inset-0 bg-grid-white/[0.03] pointer-events-none" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-white/5 blur-[80px] rounded-full pointer-events-none" />
            <CardContent className="py-10 px-8 text-center space-y-4 relative z-10">
              <h3 className="text-2xl font-black">Ready to Simplify Your Calculations?</h3>
              <p className="text-emerald-100 max-w-xl mx-auto text-xs sm:text-sm font-light">
                Join hundreds of railway contractors who use IR-PVC daily to save hours and eliminate costly computation errors.
              </p>
              <div className="flex flex-wrap justify-center gap-3 pt-2">
                <Link href="/auth/signin?mode=signup">
                  <Button size="lg" className="bg-white text-emerald-700 hover:bg-emerald-50 font-bold px-6 py-2.5 rounded-xl shadow-md transition-all text-xs">
                    Start Free Trial
                  </Button>
                </Link>
                <Link href="/contact">
                  <Button size="lg" variant="outline" className="border-white/20 text-white hover:bg-white/10 bg-transparent font-bold px-6 py-2.5 rounded-xl transition-colors text-xs">
                    Contact Sales
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
