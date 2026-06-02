'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import Image from 'next/image';
import {
  Train, Shield, Calculator, ArrowRight, FileUp, BarChart3,
  CheckCircle, Users, MessageSquare, FileText, LineChart,
  IndianRupee, Smartphone, Lock,
  TrendingDown, TrendingUp, Percent, Gift, Play,
  ChevronRight
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Footer } from '@/components/footer';

export default function HomePage() {
  const router = useRouter();
  const { status } = useSession();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (status === 'authenticated') {
      router.replace('/contracts');
    }
  }, [status, router]);

  if (!mounted || status === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto" />
          <p className="text-slate-500 font-medium tracking-wide">Loading IR-PVC...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white font-sans text-slate-800 selection:bg-blue-100 selection:text-blue-900">
      
      {/* --- HERO SECTION --- */}
      <section className="relative w-full overflow-hidden border-b border-slate-100 bg-white">
        {/* Subtle Background Blobs */}
        <div className="absolute top-0 right-0 w-[40rem] h-[40rem] bg-blue-50/30 rounded-full blur-[100px] -translate-y-1/2 translate-x-1/3 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-[30rem] h-[30rem] bg-indigo-50/30 rounded-full blur-[80px] translate-y-1/3 -translate-x-1/4 pointer-events-none" />

        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl relative pt-20 pb-28 lg:pt-32 lg:pb-40">
          <div className="flex flex-col lg:flex-row items-center gap-16 lg:gap-24">
            
            {/* Left Content */}
            <div className="flex-1 space-y-8 text-center lg:text-left z-10">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white border border-slate-200 text-sm font-medium text-slate-600 shadow-sm hover:shadow transition-shadow">
                <span className="flex h-2 w-2 rounded-full bg-blue-600 animate-pulse" />
                GCC 2022 Compliant Automation
              </div>
              
              <h1 className="text-5xl sm:text-6xl lg:text-7xl font-black tracking-tight text-slate-900 leading-[1.1]">
                Effortless PVC <br className="hidden lg:block"/>
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600">Calculations</span>
              </h1>
              
              <p className="text-lg sm:text-xl text-slate-600 leading-relaxed max-w-2xl mx-auto lg:mx-0 font-light">
                The modern platform for Indian Railway contractors to automate Price Variation Clause calculations, manage billing, and track indices instantly.
              </p>

              <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4 pt-4">
                <Link href="/auth/signin?mode=signup">
                  <Button size="lg" className="h-14 px-8 text-lg font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-lg shadow-blue-600/20 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300">
                    Get Started Now
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </Link>
                <Link href="#features">
                  <Button size="lg" variant="outline" className="h-14 px-8 text-lg font-semibold bg-white text-slate-700 border-slate-200 hover:bg-slate-50 hover:border-slate-300 rounded-xl transition-all duration-300">
                    Explore Features
                  </Button>
                </Link>
              </div>

              <div className="flex items-center justify-center lg:justify-start gap-6 pt-6 text-sm text-slate-500 font-medium">
                <span className="flex items-center gap-2"><CheckCircle className="w-5 h-5 text-emerald-500" /> Auto Indices</span>
                <span className="flex items-center gap-2"><Shield className="w-5 h-5 text-blue-500" /> Secure</span>
                <span className="flex items-center gap-2"><Smartphone className="w-5 h-5 text-purple-500" /> Mobile Ready</span>
              </div>
            </div>

            {/* Right Graphic / Logo */}
            <div className="flex-1 flex justify-center lg:justify-end z-10 w-full max-w-md lg:max-w-none">
              <div className="relative w-full aspect-square max-w-lg bg-white rounded-3xl border border-slate-100 shadow-2xl shadow-slate-200/50 p-8 flex flex-col items-center justify-center overflow-hidden group hover:border-blue-100 transition-colors duration-500">
                <div className="absolute inset-0 bg-gradient-to-br from-blue-50/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <div className="relative w-48 h-48 sm:w-64 sm:h-64 drop-shadow-xl transition-transform duration-700 group-hover:scale-105">
                  <Image
                    src="/srca-logo-official.png"
                    alt="Southern Railway Contractors Association"
                    fill
                    className="object-contain"
                    priority
                  />
                </div>
                <div className="mt-8 text-center relative z-10">
                  <p className="text-sm font-semibold text-slate-400 uppercase tracking-widest mb-2">Developed By</p>
                  <p className="text-base sm:text-lg text-slate-700 font-medium leading-tight">Southern Railway Contractors Association<br/><span className="text-slate-500">Tiruchirappalli Division</span></p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* --- CORE FEATURES (BENTO GRID) --- */}
      <section id="features" className="w-full py-24 bg-white">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl">
          <div className="text-center max-w-3xl mx-auto mb-16 space-y-4">
            <h2 className="text-4xl font-extrabold text-slate-900 tracking-tight">Everything You Need for PVC</h2>
            <p className="text-xl text-slate-500 font-light">From contract creation to final bill generation, every step is automated, accurate, and incredibly fast.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            
            <div className="group bg-slate-50 rounded-3xl p-8 lg:p-10 border border-slate-100 hover:bg-white hover:border-blue-100 hover:shadow-2xl hover:shadow-blue-900/5 transition-all duration-500 flex flex-col justify-between">
              <div>
                <div className="w-14 h-14 rounded-2xl bg-blue-600 text-white flex items-center justify-center mb-6 shadow-lg shadow-blue-600/20">
                  <FileText className="h-7 w-7" />
                </div>
                <h3 className="text-2xl font-bold text-slate-900 mb-3 tracking-tight">Automated PVC Bills</h3>
                <p className="text-slate-600 leading-relaxed font-light">
                  Create comprehensive running account bills instantly. The system automatically calculates complex PVC formulas based on GCC 46A codes, applying correct indices without manual spreadsheet entry.
                </p>
              </div>
            </div>

            <div className="group bg-slate-50 rounded-3xl p-8 lg:p-10 border border-slate-100 hover:bg-white hover:border-emerald-100 hover:shadow-2xl hover:shadow-emerald-900/5 transition-all duration-500 flex flex-col justify-between">
              <div>
                <div className="w-14 h-14 rounded-2xl bg-emerald-500 text-white flex items-center justify-center mb-6 shadow-lg shadow-emerald-500/20">
                  <TrendingUp className="h-7 w-7" />
                </div>
                <div className="flex items-center gap-3 mb-3">
                  <h3 className="text-2xl font-bold text-slate-900 tracking-tight">Steel Forecast</h3>
                  <span className="px-2.5 py-1 text-xs font-bold bg-emerald-100 text-emerald-700 rounded-full">NEW</span>
                </div>
                <p className="text-slate-600 leading-relaxed font-light">
                  Plan billing timing with advanced quarterly steel projections. Predict future index values based on historical JPC rates and market trends.
                </p>
              </div>
            </div>

            <div className="group bg-slate-50 rounded-3xl p-8 lg:p-10 border border-slate-100 hover:bg-white hover:border-cyan-100 hover:shadow-2xl hover:shadow-cyan-900/5 transition-all duration-500 flex flex-col justify-between overflow-hidden relative">
              <div className="absolute right-0 bottom-0 opacity-5 w-64 h-64 translate-x-1/4 translate-y-1/4 group-hover:scale-110 transition-transform duration-700">
                 <LineChart className="w-full h-full text-cyan-600" />
              </div>
              <div className="relative z-10">
                <div className="w-14 h-14 rounded-2xl bg-cyan-600 text-white flex items-center justify-center mb-6 shadow-lg shadow-cyan-600/20">
                  <LineChart className="h-7 w-7" />
                </div>
                <h3 className="text-2xl font-bold text-slate-900 mb-3 tracking-tight">Index Tracking</h3>
                <p className="text-slate-600 leading-relaxed font-light">
                  Stay up to date. We track PPAC diesel prices, steel JPC rates, and all 10 component indices required for GCC calculations, with historical trend charts.
                </p>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* --- HOW IT WORKS (FULL WIDTH) --- */}
      <section className="w-full bg-white py-24 text-slate-800">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl">
          <div className="flex flex-col lg:flex-row justify-between items-start gap-16">
            
            <div className="lg:w-1/3 space-y-6">
              <h2 className="text-4xl lg:text-5xl font-extrabold tracking-tight text-slate-900">How It Works</h2>
              <p className="text-xl text-slate-500 font-light leading-relaxed">
                A streamlined, intuitive workflow designed to get your PVC statements generated in less than 5 minutes.
              </p>
              <div className="pt-4">
                <Link href="/auth/signin">
                  <Button variant="outline" className="h-12 px-6 rounded-xl border-slate-200 hover:bg-slate-50 text-slate-700 bg-white transition-colors">
                    Start Your First Bill <ChevronRight className="ml-2 w-4 h-4" />
                  </Button>
                </Link>
              </div>
            </div>

            <div className="lg:w-2/3 grid grid-cols-1 sm:grid-cols-2 gap-8">
              {[
                { step: '01', title: 'Add Contract', desc: 'Securely enter your agreement details, base month, and description.', icon: <FileText className="w-6 h-6" /> },
                { step: '02', title: 'Input Bill Data', desc: 'Quickly add line items manually or upload your existing bill PDF.', icon: <FileUp className="w-6 h-6" /> },
                { step: '03', title: 'Auto Calculation', desc: 'Our engine fetches indices and computes PVC instantly.', icon: <Calculator className="w-6 h-6" /> },
                { step: '04', title: 'Export & Share', desc: 'Download precise PDF statements or share directly via WhatsApp.', icon: <MessageSquare className="w-6 h-6" /> },
              ].map((item) => (
                <div key={item.step} className="group relative p-8 rounded-3xl bg-slate-50 border border-slate-100 hover:bg-white hover:border-blue-100 hover:shadow-xl hover:shadow-blue-900/5 transition-all duration-300">
                  <div className="absolute top-8 right-8 text-4xl font-black text-slate-200/50 group-hover:text-blue-500/10 transition-colors">
                    {item.step}
                  </div>
                  <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mb-6">
                    {item.icon}
                  </div>
                  <h3 className="text-xl font-bold mb-3 text-slate-900">{item.title}</h3>
                  <p className="text-slate-500 font-light leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>

          </div>
        </div>
      </section>

      {/* --- POWERFUL TOOLS (MINI FEATURES GRID) --- */}
      <section className="w-full py-24 bg-white">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl">
          <div className="text-center max-w-3xl mx-auto mb-16 space-y-4">
            <h2 className="text-3xl lg:text-4xl font-extrabold text-slate-900 tracking-tight">The Ultimate Contractor Toolkit</h2>
            <p className="text-lg text-slate-500 font-light">More than just a calculator. A complete ecosystem to manage your railway contracts.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <MiniFeature icon={<FileUp />} title="LOA Analyzer" desc="Extract and verify agreement details automatically" />
            <MiniFeature icon={<MessageSquare />} title="WhatsApp Integration" desc="Receive bills and critical alerts directly" />
            <MiniFeature icon={<BarChart3 />} title="Deep Analytics" desc="Custom abstract reports and visual summaries" />
            <MiniFeature icon={<Users />} title="Team Access" desc="Role-based permissions for staff and admins" />
            <MiniFeature icon={<IndianRupee />} title="Auto GST" desc="One-click GST invoice generation for payments" />
            <MiniFeature icon={<Lock />} title="Extension Compliance" desc="Strict rule engines for time extension PVCs" />
            <MiniFeature icon={<CheckCircle />} title="Instant Validation" desc="Pre-validate all PVC inputs before final submission" />
            <MiniFeature icon={<Smartphone />} title="Mobile First" desc="Fully responsive design for on-site access" />
          </div>
        </div>
      </section>

      {/* --- PRICING (WIDE & AIRY) --- */}
      <section className="w-full bg-white py-24 border-y border-slate-100">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl">
          <div className="text-center max-w-3xl mx-auto mb-16 space-y-4">
            <h2 className="text-4xl font-extrabold text-slate-900 tracking-tight">Simple, Transparent Pricing</h2>
            <p className="text-xl text-slate-500 font-light">Pay only for what you use. Higher volume means deeper discounts.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
            {/* Tier 1 */}
            <div className="bg-slate-50/50 rounded-3xl p-10 border border-slate-100 shadow-lg shadow-slate-100/50 text-center flex flex-col hover:-translate-y-1 hover:bg-white hover:shadow-xl transition-all duration-300">
              <h4 className="text-slate-500 font-medium uppercase tracking-wider text-sm mb-4">Standard Volume</h4>
              <div className="flex items-end justify-center gap-1 mb-2">
                <span className="text-5xl font-black text-slate-900">₹199</span>
                <span className="text-slate-500 font-medium pb-1">/ bill</span>
              </div>
              <p className="text-slate-500 font-light mb-8">For 1 to 5 bills per day</p>
              <div className="mt-auto pt-6 border-t border-slate-100">
                <p className="text-sm font-medium text-slate-600">Base Rate</p>
              </div>
            </div>

            {/* Tier 2 */}
            <div className="bg-white rounded-3xl p-10 border-2 border-blue-500 shadow-2xl shadow-blue-900/10 text-center flex flex-col relative transform md:-translate-y-4 z-10">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 px-4 py-1.5 bg-blue-600 text-white text-sm font-bold rounded-full uppercase tracking-widest shadow-lg shadow-blue-500/30">
                Most Popular
              </div>
              <h4 className="text-blue-600 font-medium uppercase tracking-wider text-sm mb-4">Medium Volume</h4>
              <div className="flex items-end justify-center gap-1 mb-2">
                <span className="text-5xl font-black text-slate-900">₹159</span>
                <span className="text-slate-500 font-medium pb-1">/ bill</span>
              </div>
              <p className="text-slate-500 font-light mb-8">For 6 to 10 bills per day</p>
              <div className="mt-auto pt-6 border-t border-slate-100">
                <p className="text-sm font-bold text-emerald-600 flex items-center justify-center gap-2">
                  <Percent className="w-4 h-4" /> 20% Volume Discount
                </p>
              </div>
            </div>

            {/* Tier 3 */}
            <div className="bg-slate-50/50 rounded-3xl p-10 border border-slate-100 shadow-lg shadow-slate-100/50 text-center flex flex-col hover:-translate-y-1 hover:bg-white hover:shadow-xl transition-all duration-300">
              <h4 className="text-slate-500 font-medium uppercase tracking-wider text-sm mb-4">High Volume</h4>
              <div className="flex items-end justify-center gap-1 mb-2">
                <span className="text-5xl font-black text-slate-900">₹119</span>
                <span className="text-slate-500 font-medium pb-1">/ bill</span>
              </div>
              <p className="text-slate-500 font-light mb-8">For 11+ bills per day</p>
              <div className="mt-auto pt-6 border-t border-slate-100">
                <p className="text-sm font-bold text-emerald-600 flex items-center justify-center gap-2">
                  <Percent className="w-4 h-4" /> 40% Volume Discount
                </p>
              </div>
            </div>
          </div>

          {/* Advanced Tools Add-on */}
          <div className="mt-12 max-w-4xl mx-auto">
            <div className="relative overflow-hidden bg-gradient-to-r from-blue-50 via-indigo-50/50 to-purple-50 border border-indigo-100 rounded-3xl p-8 lg:p-10 flex flex-col md:flex-row items-center justify-between gap-8 hover:shadow-xl hover:border-indigo-200 transition-all duration-300">
              <div className="absolute top-0 right-0 bg-indigo-600 text-[10px] text-white font-extrabold px-4 py-1 rounded-bl-2xl tracking-widest uppercase">
                Add-on Subscription
              </div>
              <div className="space-y-4 text-center md:text-left">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white border border-indigo-200 text-xs font-semibold text-indigo-700">
                  <Gift className="w-3.5 h-3.5 text-indigo-600" />
                  Advanced Contractor Tools
                </div>
                <h3 className="text-2xl font-black text-slate-900 tracking-tight">
                  PVC Check & Work Class Analyzer
                </h3>
                <p className="text-slate-600 text-sm font-light max-w-xl">
                  Unlock unlimited access to the dynamic <strong>PVC Check tool</strong> and <strong>Classification Comparison Analyzer</strong>. Run unlimited checks with zero per-event fees!
                </p>
              </div>
              <div className="text-center shrink-0 space-y-3 bg-white/80 backdrop-blur-md border border-indigo-50 p-6 rounded-2xl min-w-[200px] shadow-sm">
                <div className="flex items-baseline justify-center gap-0.5">
                  <span className="text-4xl font-black text-indigo-600">₹99</span>
                  <span className="text-slate-500 font-medium text-xs">/ month</span>
                </div>
                <p className="text-xs text-slate-400 font-medium">Charged from credit wallet</p>
                <Link href="/auth/signin?mode=signup" className="block">
                  <Button size="sm" className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg shadow-md shadow-indigo-600/10">
                    Get Started Now
                  </Button>
                </Link>
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* --- FINAL CTA (LIGHT & CLEAN) --- */}
      <section className="w-full bg-white py-32 text-center">
        <div className="max-w-4xl mx-auto px-6">
          <h2 className="text-4xl md:text-5xl font-black text-slate-900 tracking-tight mb-6">
            Ready to Streamline Your Billing?
          </h2>
          <p className="text-xl text-slate-500 font-light mb-10 max-w-2xl mx-auto">
            Join the smart railway contractors across the Southern Railway division who use IR-PVC to save hours and eliminate calculation errors.
          </p>
          <div className="flex flex-col items-center justify-center">
            <Link href="/auth/signin?mode=signup" className="inline-block">
              <Button size="lg" className="h-16 px-10 text-xl font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-2xl shadow-xl shadow-blue-600/20 hover:shadow-2xl hover:-translate-y-1 transition-all duration-300">
                Create Your Account
                <ArrowRight className="ml-3 w-6 h-6" />
              </Button>
            </Link>
            <p className="mt-4 text-sm text-slate-400 font-medium text-center">
              Unified billing system. Pay-as-you-go credit model.
            </p>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}

// Subcomponents

function MiniFeature({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="group flex items-start gap-4 p-6 rounded-2xl border border-transparent hover:border-slate-100 hover:bg-slate-50 transition-all duration-300">
      <div className="shrink-0 w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center group-hover:scale-110 group-hover:bg-blue-100 transition-transform duration-300">
        {icon}
      </div>
      <div>
        <h4 className="font-bold text-slate-900 mb-1">{title}</h4>
        <p className="text-sm text-slate-500 font-light leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}
