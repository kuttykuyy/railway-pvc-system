'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import Image from 'next/image';
import {
  Train, Shield, Calculator, ArrowRight, BarChart3,
  CheckCircle, Users, MessageSquare, FileText, LineChart,
  IndianRupee, Smartphone, Lock,
  TrendingUp, Gift, Play,
  ChevronRight, Download, Layers, FileSpreadsheet,
  CalendarDays, ReceiptText, ScanSearch
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
        <div className="absolute top-0 right-0 w-[40rem] h-[40rem] bg-blue-50/30 rounded-full blur-[100px] -translate-y-1/2 translate-x-1/3 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-[30rem] h-[30rem] bg-indigo-50/30 rounded-full blur-[80px] translate-y-1/3 -translate-x-1/4 pointer-events-none" />

        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl relative pt-20 pb-28 lg:pt-32 lg:pb-40">
          <div className="flex flex-col lg:flex-row items-center gap-16 lg:gap-24">

            {/* Left Content */}
            <div className="flex-1 space-y-8 text-center lg:text-left z-10">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white border border-slate-200 text-sm font-medium text-slate-600 shadow-sm hover:shadow transition-shadow">
                <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                Free Trial · IR Standard PDF · Free Preview
              </div>

              <h1 className="text-5xl sm:text-6xl lg:text-7xl font-black tracking-tight text-slate-900 leading-[1.1]">
                Effortless PVC <br className="hidden lg:block"/>
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600">Calculations</span>
              </h1>

              <p className="text-lg sm:text-xl text-slate-600 leading-relaxed max-w-2xl mx-auto lg:mx-0 font-light">
                The modern platform for Indian Railway contractors to automate Price Variation Clause calculations, generate IR Standard PVC statements, manage bulk billing, and track indices instantly—now with full Hindi (हिन्दी) language support.
              </p>

              <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4 pt-4">
                <Link href="/auth/signin?mode=signup">
                  <Button size="lg" className="h-14 px-8 text-lg font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-lg shadow-blue-600/20 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300">
                    Get Started Now
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </Link>
                <Link href="#tutorials">
                  <Button size="lg" variant="outline" className="h-14 px-8 text-lg font-semibold bg-white text-slate-700 border-slate-200 hover:bg-slate-50 hover:border-slate-300 rounded-xl transition-all duration-300 flex items-center gap-2">
                    <Play className="w-5 h-5 text-blue-600 fill-blue-600" />
                    Watch Tutorials
                  </Button>
                </Link>
              </div>

              <div className="flex flex-wrap items-center justify-center lg:justify-start gap-5 pt-6 text-sm text-slate-500 font-medium">
                <span className="flex items-center gap-2"><CheckCircle className="w-5 h-5 text-emerald-500" /> Auto Indices</span>
                <span className="flex items-center gap-2"><FileText className="w-5 h-5 text-blue-500" /> IR Standard PDF</span>
                <span className="flex items-center gap-2"><Layers className="w-5 h-5 text-purple-500" /> Bulk Bills</span>
                <span className="flex items-center gap-2"><TrendingUp className="w-5 h-5 text-emerald-500" /> Free Preview</span>
                <span className="flex items-center gap-2"><Users className="w-5 h-5 text-indigo-500" /> Bilingual (English / हिन्दी)</span>
              </div>
            </div>

            {/* Right Graphic */}
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
            <p className="text-xl text-slate-500 font-light">From contract creation to IR Standard statements — every step automated, accurate, and fast.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

            <div className="group bg-slate-50 rounded-3xl p-8 lg:p-10 border border-slate-100 hover:bg-white hover:border-blue-100 hover:shadow-2xl hover:shadow-blue-900/5 transition-all duration-500 flex flex-col justify-between">
              <div>
                <div className="w-14 h-14 rounded-2xl bg-blue-600 text-white flex items-center justify-center mb-6 shadow-lg shadow-blue-600/20">
                  <FileText className="h-7 w-7" />
                </div>
                <h3 className="text-2xl font-bold text-slate-900 mb-3 tracking-tight">Automated PVC Bills</h3>
                <p className="text-slate-600 leading-relaxed font-light">
                  Create comprehensive running account bills instantly. The system automatically calculates PVC formulas per GCC Clause 17, applying correct quarterly indices without any manual spreadsheet entry.
                </p>
              </div>
            </div>

            <div className="group bg-slate-50 rounded-3xl p-8 lg:p-10 border border-slate-100 hover:bg-white hover:border-orange-100 hover:shadow-2xl hover:shadow-orange-900/5 transition-all duration-500 flex flex-col justify-between">
              <div>
                <div className="w-14 h-14 rounded-2xl bg-orange-500 text-white flex items-center justify-center mb-6 shadow-lg shadow-orange-500/20">
                  <ReceiptText className="h-7 w-7" />
                </div>
                <div className="flex items-center gap-3 mb-3">
                  <h3 className="text-2xl font-bold text-slate-900 tracking-tight">IR Standard PDF</h3>
                  <span className="px-2.5 py-1 text-xs font-bold bg-orange-100 text-orange-700 rounded-full">NEW</span>
                </div>
                <p className="text-slate-600 leading-relaxed font-light">
                  Generate official GCC Clause 17 PVC statements in Indian Railway standard format — with formula display, fixed component row, monthly index history, provisional watermark, and affected-indices-only tables.
                </p>
              </div>
            </div>

            <div className="group bg-slate-50 rounded-3xl p-8 lg:p-10 border border-slate-100 hover:bg-white hover:border-purple-100 hover:shadow-2xl hover:shadow-purple-900/5 transition-all duration-500 flex flex-col justify-between">
              <div>
                <div className="w-14 h-14 rounded-2xl bg-purple-600 text-white flex items-center justify-center mb-6 shadow-lg shadow-purple-600/20">
                  <Layers className="h-7 w-7" />
                </div>
                <div className="flex items-center gap-3 mb-3">
                  <h3 className="text-2xl font-bold text-slate-900 tracking-tight">Bulk Bill Creation</h3>
                  <span className="px-2.5 py-1 text-xs font-bold bg-purple-100 text-purple-700 rounded-full">NEW</span>
                </div>
                <p className="text-slate-600 leading-relaxed font-light">
                  Submit multiple bills in one shot. Set zone and fuel basis once for all bills, enter classification-based amounts per row, and download individual or combined PDF reports in Detailed or IR Standard format.
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
                  Always up to date. We track PPAC diesel prices, steel JPC rates, and all 10 component indices required for GCC calculations, with full monthly history and trend charts.
                </p>
              </div>
            </div>

            <div className="group bg-slate-50 rounded-3xl p-8 lg:p-10 border border-slate-100 hover:bg-white hover:border-indigo-100 hover:shadow-2xl hover:shadow-indigo-900/5 transition-all duration-500 flex flex-col justify-between">
              <div>
                <div className="w-14 h-14 rounded-2xl bg-indigo-600 text-white flex items-center justify-center mb-6 shadow-lg shadow-indigo-600/20">
                  <CalendarDays className="h-7 w-7" />
                </div>
                <h3 className="text-2xl font-bold text-slate-900 mb-3 tracking-tight">Extension Compliance</h3>
                <p className="text-slate-600 leading-relaxed font-light">
                  Handles 17A / 17B extension clauses automatically. Dedicated steel and cement PVC components, correct index selection per extension type, and proper cumulative tracking across all bills.
                </p>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* --- HOW IT WORKS --- */}
      <section className="w-full bg-white py-24 text-slate-800">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl">
          <div className="flex flex-col lg:flex-row justify-between items-start gap-16">

            <div className="lg:w-1/3 space-y-6">
              <h2 className="text-4xl lg:text-5xl font-extrabold tracking-tight text-slate-900">How It Works</h2>
              <p className="text-xl text-slate-500 font-light leading-relaxed">
                A streamlined workflow designed to get your PVC statements generated in under 5 minutes.
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
                { step: '01', title: 'Add Contract', desc: 'Enter agreement details, base month, zone, and extension type. The system validates against Railway norms automatically.', icon: <FileText className="w-6 h-6" /> },
                { step: '02', title: 'Input Bill Data', desc: 'Add line items by classification — or use Bulk Bill Creation to submit multiple bills at once with shared zone and fuel settings.', icon: <Layers className="w-6 h-6" /> },
                { step: '03', title: 'Auto Calculation', desc: 'Our engine fetches current indices from official sources and computes PVC per GCC Clause 17 instantly — no manual lookups.', icon: <Calculator className="w-6 h-6" /> },
                { step: '04', title: 'Export PDF', desc: 'Download in Detailed Report or IR Standard Format (GCC Cl.17 proforma with monthly indices, formula, and fixed component row). Share via WhatsApp.', icon: <Download className="w-6 h-6" /> },
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

      {/* --- TUTORIAL VIDEOS --- */}
      <section id="tutorials" className="w-full py-24 bg-slate-50 border-y border-slate-100">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl">
          <div className="text-center max-w-3xl mx-auto mb-16 space-y-4">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white border border-slate-200 text-sm font-semibold text-slate-600 shadow-sm">
              <Play className="w-4 h-4 text-blue-600 fill-blue-600" />
              Video Tutorials
            </div>
            <h2 className="text-3xl lg:text-4xl font-extrabold text-slate-900 tracking-tight">Get Up and Running in Minutes</h2>
            <p className="text-lg text-slate-500 font-light">Watch our step-by-step guides to start generating IR Standard PVC statements immediately.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { id: 'dnGZqdycfoE', title: 'IR-PVC Signup Process', desc: 'Create your account and set up your profile step by step', badge: 'Start Here' },
              { id: 'zx3UbfhG9l4', title: 'How to Add a Contract', desc: 'Add and configure your railway contracts with base month and zone details', badge: null },
              { id: 'Xqphs4RHWig', title: 'IR-PVC Bill Creation', desc: 'Generate a complete PVC bill with IR Standard PDF from start to finish', badge: null },
            ].map((video) => (
              <a
                key={video.id}
                href={`https://youtu.be/${video.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="group block bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm hover:shadow-xl hover:-translate-y-1 hover:border-blue-100 transition-all duration-300"
              >
                <div className="relative aspect-video bg-slate-100 overflow-hidden">
                  <Image
                    src={`https://img.youtube.com/vi/${video.id}/hqdefault.jpg`}
                    alt={video.title}
                    fill
                    className="object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                    <div className="w-16 h-16 rounded-full bg-white/90 flex items-center justify-center shadow-xl group-hover:scale-110 transition-transform duration-300">
                      <Play className="w-7 h-7 text-blue-600 fill-blue-600 ml-1" />
                    </div>
                  </div>
                  {video.badge && (
                    <div className="absolute top-3 left-3 px-2.5 py-1 bg-orange-500 text-white text-xs font-bold rounded-full">
                      {video.badge}
                    </div>
                  )}
                </div>
                <div className="p-5">
                  <h4 className="font-bold text-slate-900 mb-1 group-hover:text-blue-600 transition-colors">{video.title}</h4>
                  <p className="text-sm text-slate-500 font-light">{video.desc}</p>
                </div>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* --- POWERFUL TOOLS (MINI FEATURES GRID) --- */}
      <section className="w-full py-24 bg-white">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl">
          <div className="text-center max-w-3xl mx-auto mb-16 space-y-4">
            <h2 className="text-3xl lg:text-4xl font-extrabold text-slate-900 tracking-tight">The Ultimate Contractor Toolkit</h2>
            <p className="text-lg text-slate-500 font-light">More than a calculator. A complete ecosystem for Indian Railway PVC management.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <MiniFeature icon={<Gift />} title="Free Trial" desc="First PVC bill is completely free for every new user — no credits needed, watermarked PDF" badge="New" />
            <MiniFeature icon={<ReceiptText />} title="IR Standard PDF" desc="Official GCC Cl.17 statement with monthly indices, formula, and provisional watermark" badge="New" />
            <MiniFeature icon={<Layers />} title="Bulk Bill Creation" desc="Create and submit multiple bills simultaneously with one-time zone & fuel setup" badge="New" />
            <MiniFeature icon={<Download />} title="Bulk PDF Download" desc="Download Detailed or IR Standard PDFs for multiple bills merged into one file" badge="New" />
            <MiniFeature icon={<FileSpreadsheet />} title="Excel Contract Import" desc="Import multiple contracts at once via Excel/CSV template — saves hours of manual entry" badge="New" />
            <MiniFeature icon={<ScanSearch />} title="Free PVC Preview" desc="See the full PVC breakdown before paying — no credits deducted for preview calculations" badge="New" />
            <MiniFeature icon={<MessageSquare />} title="WhatsApp Integration" desc="Receive bills and critical alerts directly on WhatsApp" />
            <MiniFeature icon={<BarChart3 />} title="Deep Analytics" desc="Custom abstract reports and visual summaries across contracts" />
            <MiniFeature icon={<Users />} title="Bilingual Support" desc="Switch seamlessly between English and Hindi (हिन्दी) across all dashboards, contracts, and bills" badge="New" />
            <MiniFeature icon={<IndianRupee />} title="GST Billing" desc="18% GST applied transparently on credit top-ups with full invoice generation" />
            <MiniFeature icon={<Lock />} title="Extension Compliance" desc="17A / 17B rule engines with dedicated steel and cement PVC" />
            <MiniFeature icon={<Smartphone />} title="Mobile First" desc="Fully responsive design for on-site field access" />
          </div>
        </div>
      </section>

      {/* --- PRICING --- */}
      <section className="w-full bg-white py-24 border-y border-slate-100">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl">
          <div className="text-center max-w-3xl mx-auto mb-16 space-y-4">
            <h2 className="text-4xl font-extrabold text-slate-900 tracking-tight">Simple, Transparent Pricing</h2>
            <p className="text-xl text-slate-500 font-light">Credit-based pay-as-you-go. Top up your wallet, use credits per bill. No subscriptions, no lock-in.</p>
          </div>

          {/* Free trial banner */}
          <div className="max-w-4xl mx-auto mb-6">
            <div className="flex items-center gap-4 bg-emerald-50 border border-emerald-200 rounded-2xl px-6 py-4">
              <span className="text-3xl">🎉</span>
              <div className="flex-1">
                <p className="font-black text-emerald-900 text-lg">Your first bill is completely FREE</p>
                <p className="text-emerald-700 text-sm font-light">New users get one free PVC bill as a trial. No payment or credits needed — applied automatically.</p>
              </div>
              <div className="shrink-0 text-right hidden sm:block">
                <p className="text-3xl font-black text-emerald-600">FREE</p>
                <p className="text-xs text-emerald-500">First bill trial</p>
              </div>
            </div>
          </div>

          {/* Main pricing card */}
          <div className="max-w-4xl mx-auto mb-12">
            <div className="bg-white rounded-3xl border-2 border-blue-500 shadow-2xl shadow-blue-900/10 overflow-hidden">
              <div className="grid grid-cols-1 md:grid-cols-2">
                {/* Left: price */}
                <div className="p-10 lg:p-12 flex flex-col justify-center border-b md:border-b-0 md:border-r border-slate-100">
                  <p className="text-sm font-semibold text-blue-600 uppercase tracking-widest mb-3">Per Bill Credit Cost</p>
                  <div className="flex items-end gap-2 mb-1">
                    <span className="text-7xl font-black text-slate-900">₹199</span>
                    <span className="text-slate-500 font-medium pb-2 text-lg">/ bill</span>
                  </div>
                  <p className="text-xs text-emerald-600 font-semibold mb-3">First bill FREE — one-time trial automatically applied for new users</p>
                  <p className="text-slate-500 font-light text-sm leading-relaxed">
                    Each PVC bill deducts credits from your wallet. Top up any amount — credits never expire.
                  </p>
                  <div className="mt-6 flex flex-col gap-2">
                    <span className="flex items-center gap-2 text-sm text-slate-600 font-medium"><CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" /> Free PVC preview before paying</span>
                    <span className="flex items-center gap-2 text-sm text-slate-600 font-medium"><CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" /> All PDF formats (Detailed + IR Standard)</span>
                    <span className="flex items-center gap-2 text-sm text-slate-600 font-medium"><CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" /> Bulk bill creation at same rate</span>
                    <span className="flex items-center gap-2 text-sm text-slate-600 font-medium"><CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" /> PVC check credit applied if checked recently</span>
                  </div>
                </div>
                {/* Right: credit top-up info */}
                <div className="p-10 lg:p-12 flex flex-col justify-center bg-slate-50/50">
                  <p className="text-sm font-semibold text-slate-500 uppercase tracking-widest mb-4">Credit Top-Up</p>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between py-3 border-b border-slate-100">
                      <span className="text-slate-700 font-medium">Top-up amount</span>
                      <span className="font-semibold text-slate-900">Your choice</span>
                    </div>
                    <div className="flex items-center justify-between py-3 border-b border-slate-100">
                      <span className="text-slate-700 font-medium">GST (18%)</span>
                      <span className="font-semibold text-slate-700">Added on top</span>
                    </div>
                    <div className="flex items-center justify-between py-3 border-b border-slate-100">
                      <span className="text-slate-700 font-medium">GST Invoice</span>
                      <span className="font-semibold text-emerald-600 flex items-center gap-1"><CheckCircle className="w-4 h-4" /> Auto-generated</span>
                    </div>
                    <div className="flex items-center justify-between py-3">
                      <span className="text-slate-700 font-medium">Credits expire</span>
                      <span className="font-semibold text-blue-600">Never</span>
                    </div>
                  </div>
                  <Link href="/auth/signin?mode=signup" className="mt-6 block">
                    <Button className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-lg shadow-blue-600/20">
                      Get Started — First Bill Free <ArrowRight className="ml-2 w-4 h-4" />
                    </Button>
                  </Link>
                </div>
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

      {/* --- FINAL CTA --- */}
      <section className="w-full bg-white py-32 text-center">
        <div className="max-w-4xl mx-auto px-6">
          <h2 className="text-4xl md:text-5xl font-black text-slate-900 tracking-tight mb-6">
            Ready to Streamline Your Billing?
          </h2>
          <p className="text-xl text-slate-500 font-light mb-10 max-w-2xl mx-auto">
            Join smart railway contractors across India who use IR-PVC to save hours, eliminate errors, and generate Railway-standard PVC statements instantly.
          </p>
          <div className="flex flex-col items-center justify-center">
            <Link href="/auth/signin?mode=signup" className="inline-block">
              <Button size="lg" className="h-16 px-10 text-xl font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-2xl shadow-xl shadow-blue-600/20 hover:shadow-2xl hover:-translate-y-1 transition-all duration-300">
                Create Your Account
                <ArrowRight className="ml-3 w-6 h-6" />
              </Button>
            </Link>
            <p className="mt-4 text-sm text-slate-400 font-medium text-center">
              First bill FREE · Free PVC preview · Pay-as-you-go credits · GST invoices included
            </p>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}

function MiniFeature({ icon, title, desc, badge }: { icon: React.ReactNode; title: string; desc: string; badge?: string }) {
  return (
    <div className="group flex items-start gap-4 p-6 rounded-2xl border border-transparent hover:border-slate-100 hover:bg-slate-50 transition-all duration-300">
      <div className="shrink-0 w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center group-hover:scale-110 group-hover:bg-blue-100 transition-transform duration-300">
        {icon}
      </div>
      <div>
        <div className="flex items-center gap-2 mb-1">
          <h4 className="font-bold text-slate-900">{title}</h4>
          {badge && (
            <span className="px-1.5 py-0.5 text-[10px] font-bold bg-orange-100 text-orange-600 rounded-full uppercase tracking-wide">{badge}</span>
          )}
        </div>
        <p className="text-sm text-slate-500 font-light leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}
