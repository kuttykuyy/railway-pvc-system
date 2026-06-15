'use client';

import { BackButton } from '@/components/ui/back-button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Check, IndianRupee, Zap, Building2, Users, Shield, Clock, Award, Sparkles, CheckCircle, Crown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export default function PricingPage() {
  return (
    <div className="relative min-h-screen pb-16 space-y-8 overflow-hidden bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/50">
      {/* Decorative Light Backdrops */}
      <div className="absolute top-0 right-10 w-96 h-96 bg-blue-300/10 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute top-1/3 -left-20 w-80 h-80 bg-indigo-300/10 blur-[100px] rounded-full pointer-events-none" />
      <div className="absolute bottom-10 right-20 w-[450px] h-[450px] bg-purple-300/5 blur-[150px] rounded-full pointer-events-none" />

      <div className="container mx-auto px-4 py-8 max-w-6xl relative z-10 space-y-8">
        <BackButton href="/" variant="outline" className="mb-4 border-slate-200/80 bg-white/80 hover:bg-slate-50 text-slate-600 hover:text-slate-800" />
        
        {/* Header Section */}
        <div className="text-center space-y-4 max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200/50 rounded-full">
            <Sparkles className="h-3 w-3 text-blue-600 animate-pulse" />
            Flexible Credit Structure
          </div>
          <h1 className="text-4xl sm:text-5xl font-black tracking-tight bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 bg-clip-text text-transparent">
            Simple, Transparent Pricing
          </h1>
          <p className="text-sm sm:text-base text-slate-500 font-normal">
            Pay only for what you process with a simple flat-rate credit system. Start with a free trial on your first bill.
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="max-w-xl mx-auto pt-4">
          <Card className="flex flex-col justify-between border border-blue-200 rounded-3xl transition-all duration-300 relative overflow-hidden bg-gradient-to-b from-blue-50/50 to-white shadow-[0_20px_50px_rgba(37,99,235,0.08)] hover:shadow-lg">
            <div className="absolute top-0 right-0 bg-blue-600 text-[10px] text-white font-extrabold px-3.5 py-1 tracking-wider uppercase">
              Flat Rate
            </div>
            
            <CardHeader className="text-center pb-6 pt-8">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4 border text-blue-600 bg-blue-50 border-blue-100">
                <Zap className="h-6 w-6" />
              </div>
              <CardTitle className="text-xl font-black text-slate-800 mb-2">Standard Plan</CardTitle>
              <div className="flex items-baseline justify-center gap-0.5 mt-2">
                <IndianRupee className="h-6 w-6 text-blue-600 font-bold" />
                <span className="text-4xl font-black tracking-tight text-blue-600">199</span>
                <span className="text-xs text-slate-500 font-medium ml-1">/ bill</span>
              </div>
              <p className="text-xs text-slate-500 font-light mt-1">Pay-as-you-go credit structure. No hidden fees.</p>
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
                  <Button className="w-full font-bold py-5 rounded-xl transition-all shadow-md bg-blue-600 hover:bg-blue-700 text-white shadow-blue-500/10">
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
          <Card className="border-0 shadow-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-3xl overflow-hidden relative">
            <div className="absolute inset-0 bg-grid-white/[0.03] pointer-events-none" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-white/5 blur-[80px] rounded-full pointer-events-none" />
            <CardContent className="py-10 px-8 text-center space-y-4 relative z-10">
              <h3 className="text-2xl font-black">Ready to Simplify Your Calculations?</h3>
              <p className="text-blue-100 max-w-xl mx-auto text-xs sm:text-sm font-light">
                Join hundreds of railway contractors who use IR-PVC daily to save hours and eliminate costly computation errors.
              </p>
              <div className="flex flex-wrap justify-center gap-3 pt-2">
                <Link href="/auth/signin?mode=signup">
                  <Button size="lg" className="bg-white text-blue-700 hover:bg-blue-50 font-bold px-6 py-2.5 rounded-xl shadow-md transition-all text-xs">
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
