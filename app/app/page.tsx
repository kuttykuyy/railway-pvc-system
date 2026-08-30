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
  CalendarDays, ReceiptText, ScanSearch, Sparkles, Send
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Footer } from '@/components/footer';

export default function HomePage() {
  const router = useRouter();
  const { status } = useSession();
  const [mounted, setMounted] = useState(false);
  const [pricing, setPricing] = useState({ billCost: 199, aiBillCost: 499 });

  useEffect(() => {
    setMounted(true);
    fetch('/api/public/pricing')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data) setPricing({ billCost: data.billCost ?? 199, aiBillCost: data.aiBillCost ?? 499 }); })
      .catch(() => {});
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
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600 mx-auto" />
          <p className="text-slate-500 font-medium tracking-wide">Loading IR-PVC...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white font-sans text-slate-800 selection:bg-emerald-100 selection:text-emerald-900">

      {/* --- HERO SECTION (split: web app | telegram) --- */}
      <section className="relative w-full overflow-hidden border-b border-slate-100 bg-white">
        <div className="absolute top-0 right-0 w-[40rem] h-[40rem] bg-sky-50/40 rounded-full blur-[100px] -translate-y-1/2 translate-x-1/3 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-[30rem] h-[30rem] bg-emerald-50/40 rounded-full blur-[80px] translate-y-1/3 -translate-x-1/4 pointer-events-none" />

        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl relative pt-16 pb-20 lg:pt-24 lg:pb-24">
          <div className="text-center max-w-3xl mx-auto mb-10 lg:mb-14 space-y-4">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight text-slate-900 leading-[1.1]">
              Two ways to get your <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-600 to-sky-600">ready PVC bill.</span>
            </h1>
            <p className="text-lg text-slate-500 font-light">
              Indian Railway contractors — use the full web app, or get your PVC in seconds on Telegram.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6 lg:gap-8 items-stretch">

            {/* LEFT — Web app */}
            <div className="relative flex flex-col rounded-3xl border border-emerald-100 bg-gradient-to-b from-emerald-50/60 to-white p-8 lg:p-10 shadow-lg shadow-emerald-900/5">
              <div className="inline-flex self-start items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-100 text-sm font-semibold text-emerald-700">
                <Sparkles className="h-4 w-4" /> Web app · AI extraction
              </div>
              <h2 className="mt-5 text-3xl lg:text-4xl font-black tracking-tight text-slate-900 leading-tight">
                Upload the bill PDF,<br /> get a ready PVC bill.
              </h2>
              <p className="mt-4 text-slate-600 font-light leading-relaxed">
                Upload your signed bill PDF and let AI extract the schedules, quantities, rates and classifications — or enter them yourself. IR Standard statements, bulk billing, live indices, full Hindi (हिन्दी) support.
              </p>
              <div className="mt-5 flex flex-wrap gap-x-4 gap-y-2 text-sm text-slate-500 font-medium">
                <span className="flex items-center gap-1.5"><ScanSearch className="w-4 h-4 text-emerald-500" /> AI PDF Extraction</span>
                <span className="flex items-center gap-1.5"><FileText className="w-4 h-4 text-emerald-500" /> IR Standard PDF</span>
                <span className="flex items-center gap-1.5"><Layers className="w-4 h-4 text-emerald-500" /> Bulk Bills</span>
              </div>
              <div className="mt-auto pt-7">
                <Link href="/auth/signin?mode=signup" className="block">
                  <Button size="lg" className="w-full h-16 px-6 text-lg font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-lg shadow-emerald-600/20 hover:-translate-y-0.5 transition-all">
                    Get Started Now <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </Link>
              </div>
            </div>

            {/* RIGHT — Telegram */}
            <div className="relative flex flex-col overflow-hidden rounded-3xl border border-sky-500 bg-gradient-to-br from-sky-600 to-sky-800 p-8 lg:p-10 shadow-2xl shadow-sky-900/20 text-white">
              <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -translate-y-1/3 translate-x-1/4 pointer-events-none" />
              <div className="relative inline-flex self-start items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/15 text-sm font-semibold backdrop-blur">
                <Send className="h-4 w-4" /> New · Telegram
              </div>
              <h2 className="relative mt-5 text-3xl lg:text-4xl font-black tracking-tight leading-tight">
                Get your PVC<br /> right inside Telegram.
              </h2>
              <p className="relative mt-4 text-sky-100 font-light leading-relaxed">
                No login, no forms. Send your <span className="font-semibold text-white">agreement</span> and <span className="font-semibold text-white">running bill</span> PDFs to the bot and get the PVC amount in seconds — pay in chat for the full IR statement.
              </p>
              <ul className="relative mt-5 space-y-2.5">
                {[
                  'PVC amount free — no account needed',
                  'Reads & classifies the bill automatically',
                  'Official IR statement with index docs',
                  'Pay by UPI / card, right in the chat',
                ].map((t) => (
                  <li key={t} className="flex items-start gap-2.5">
                    <CheckCircle className="w-5 h-5 text-sky-200 shrink-0 mt-0.5" />
                    <span className="text-sky-50 text-sm">{t}</span>
                  </li>
                ))}
              </ul>
              <div className="relative mt-auto pt-7">
                <a href="https://t.me/Pvcbill_bot" target="_blank" rel="noopener noreferrer"
                   className="inline-flex w-full sm:w-auto justify-center items-center gap-2 rounded-xl bg-white px-6 py-3.5 text-sky-700 font-bold shadow-lg hover:bg-sky-50 hover:-translate-y-0.5 transition-all">
                  <Send className="w-5 h-5" /> Open @Pvcbill_bot <ArrowRight className="w-4 h-4" />
                </a>
              </div>
            </div>
          </div>

          {/* SRCA / ILLALL credit */}
          <div className="mt-10 flex items-center justify-center gap-3 text-center">
            <div className="relative h-9 w-9 shrink-0">
              <Image src="/srca-logo-official.png" alt="Southern Railway Contractors Association" fill className="object-contain" priority />
            </div>
            <p className="text-xs text-slate-400 leading-tight">
              Developed for <span className="font-semibold text-slate-500">Southern Railway Contractors Association</span>, Tiruchirappalli Division
              · Powered by <strong className="font-semibold text-emerald-600">ILLALL TECH</strong>
            </p>
          </div>
        </div>
      </section>

      {/* --- CORE FEATURES (BENTO GRID) --- */}
      <section id="features" className="w-full py-14 sm:py-24 bg-white">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl">
          <div className="text-center max-w-3xl mx-auto mb-16 space-y-4">
            <h2 className="text-4xl font-extrabold text-slate-900 tracking-tight">Everything You Need for PVC</h2>
            <p className="text-xl text-slate-500 font-light">From contract creation to IR Standard statements — every step automated, accurate, and fast.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

            <div className="group relative bg-gradient-to-br from-emerald-600 to-emerald-700 rounded-3xl p-8 lg:p-10 border border-emerald-500 shadow-2xl shadow-emerald-900/20 hover:-translate-y-1 transition-all duration-500 flex flex-col justify-between md:col-span-2 lg:col-span-1 overflow-hidden">
              <div className="absolute top-0 right-0 w-40 h-40 bg-white/10 rounded-full blur-2xl -translate-y-1/3 translate-x-1/3 pointer-events-none" />
              <div className="relative">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/15 text-white text-[11px] font-bold uppercase tracking-wider mb-5">
                  <Sparkles className="h-3 w-3" /> New
                </div>
                <div className="w-14 h-14 rounded-2xl bg-white/15 text-white flex items-center justify-center mb-6 backdrop-blur-sm">
                  <ScanSearch className="h-7 w-7" />
                </div>
                <h3 className="text-2xl font-bold text-white mb-3 tracking-tight">AI PDF Bill Extraction</h3>
                <p className="text-emerald-100 leading-relaxed font-light">
                  Upload your signed railway bill PDF and let AI read it — schedules, current quantities, agreement rates, work classifications, and cement/steel calculations, all laid out for a quick review. Works for single bills and bulk uploads. Extraction and preview are free.
                </p>
              </div>
            </div>

            <div className="group bg-slate-50 rounded-3xl p-8 lg:p-10 border border-slate-100 hover:bg-white hover:border-emerald-100 hover:shadow-2xl hover:shadow-emerald-900/5 transition-all duration-500 flex flex-col justify-between">
              <div>
                <div className="w-14 h-14 rounded-2xl bg-emerald-600 text-white flex items-center justify-center mb-6 shadow-lg shadow-emerald-600/20">
                  <FileText className="h-7 w-7" />
                </div>
                <h3 className="text-2xl font-bold text-slate-900 mb-3 tracking-tight">Automated PVC Bills</h3>
                <p className="text-slate-600 leading-relaxed font-light">
                  Create comprehensive running account bills instantly. The system automatically calculates PVC formulas per GCC Clause 46A, applying correct quarterly indices without any manual spreadsheet entry.
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
                  Generate official GCC Clause 46A PVC statements in Indian Railway standard format — with formula display, fixed component row, monthly index history, provisional watermark, and affected-indices-only tables.
                </p>
              </div>
            </div>

            <div className="group bg-slate-50 rounded-3xl p-8 lg:p-10 border border-slate-100 hover:bg-white hover:border-emerald-100 hover:shadow-2xl hover:shadow-emerald-900/5 transition-all duration-500 flex flex-col justify-between">
              <div>
                <div className="w-14 h-14 rounded-2xl bg-emerald-600 text-white flex items-center justify-center mb-6 shadow-lg shadow-emerald-600/20">
                  <Layers className="h-7 w-7" />
                </div>
                <div className="flex items-center gap-3 mb-3">
                  <h3 className="text-2xl font-bold text-slate-900 tracking-tight">Bulk Bill Creation</h3>
                  <span className="px-2.5 py-1 text-xs font-bold bg-emerald-100 text-emerald-700 rounded-full">NEW</span>
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

            <div className="group bg-slate-50 rounded-3xl p-8 lg:p-10 border border-slate-100 hover:bg-white hover:border-emerald-100 hover:shadow-2xl hover:shadow-emerald-900/5 transition-all duration-500 flex flex-col justify-between overflow-hidden relative">
              <div className="absolute right-0 bottom-0 opacity-5 w-64 h-64 translate-x-1/4 translate-y-1/4 group-hover:scale-110 transition-transform duration-700">
                <LineChart className="w-full h-full text-emerald-600" />
              </div>
              <div className="relative z-10">
                <div className="w-14 h-14 rounded-2xl bg-emerald-600 text-white flex items-center justify-center mb-6 shadow-lg shadow-emerald-600/20">
                  <LineChart className="h-7 w-7" />
                </div>
                <h3 className="text-2xl font-bold text-slate-900 mb-3 tracking-tight">Index Tracking</h3>
                <p className="text-slate-600 leading-relaxed font-light">
                  Always up to date. We track PPAC diesel prices, steel JPC rates, and all 10 component indices required for GCC calculations, with full monthly history and trend charts.
                </p>
              </div>
            </div>

            <div className="group bg-slate-50 rounded-3xl p-8 lg:p-10 border border-slate-100 hover:bg-white hover:border-emerald-100 hover:shadow-2xl hover:shadow-emerald-900/5 transition-all duration-500 flex flex-col justify-between">
              <div>
                <div className="w-14 h-14 rounded-2xl bg-emerald-600 text-white flex items-center justify-center mb-6 shadow-lg shadow-emerald-600/20">
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
      <section className="w-full bg-white py-14 sm:py-24 text-slate-800">
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
                { step: '02', title: 'Add or Upload Bill Data', desc: 'Upload your signed bill PDF and let AI extract the items automatically, or add line items by classification yourself. Bulk upload multiple bills at once with shared zone and fuel settings.', icon: <ScanSearch className="w-6 h-6" /> },
                { step: '03', title: 'Auto Calculation', desc: 'Our engine fetches current indices from official sources and computes PVC per GCC Clause 46A instantly — no manual lookups.', icon: <Calculator className="w-6 h-6" /> },
                { step: '04', title: 'Export PDF', desc: 'Download in Detailed Report or IR Standard Format (GCC Cl.46A proforma with monthly indices, formula, and fixed component row). Share via WhatsApp.', icon: <Download className="w-6 h-6" /> },
              ].map((item) => (
                <div key={item.step} className="group relative p-8 rounded-3xl bg-slate-50 border border-slate-100 hover:bg-white hover:border-emerald-100 hover:shadow-xl hover:shadow-emerald-900/5 transition-all duration-300">
                  <div className="absolute top-8 right-8 text-4xl font-black text-slate-200/50 group-hover:text-emerald-500/10 transition-colors">
                    {item.step}
                  </div>
                  <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-6">
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

      {/* --- THE CAG NUMBERS — why getting PVC right matters --- */}
      <section className="w-full py-14 sm:py-24 bg-slate-900 text-white">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl">
          <div className="max-w-3xl">
            <p className="text-emerald-400 font-semibold uppercase tracking-widest text-sm mb-4">Why it matters</p>
            <h2 className="text-4xl lg:text-5xl font-extrabold tracking-tight">
              The CAG found <span className="text-emerald-400">₹1,172 crore</span> in wrong PVC payments.
            </h2>
            <p className="mt-6 text-xl text-slate-300 font-light leading-relaxed">
              Auditing 886 Railway works contracts, the Comptroller &amp; Auditor General found excess and short
              payments of price variation across every zone — from wrong base months to wrong component
              percentages. These are exactly the errors IR-PVC computes out of existence.
            </p>
          </div>
          <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { amount: '₹20.26 cr', finding: 'excess paid from the wrong base month after tender negotiations', guard: 'Base month is derived and checked on every bill' },
              { amount: '₹206.88 cr', finding: 'avoidable PVC paid during extended contract periods', guard: '17-A / 17-B extension rules applied automatically' },
              { amount: '₹11.10 cr', finding: 'excess from wrong formulas, percentages and indices', guard: 'Fixed GCC 46A tables and published indices — nothing typed by hand' },
              { amount: '66 contracts', finding: 'computed PVC on the wrong quarter', guard: 'The quarter is calculated from the base month, never chosen' },
            ].map((item) => (
              <div key={item.amount} className="rounded-2xl bg-slate-800/60 border border-slate-700/60 p-6">
                <p className="text-3xl font-black text-emerald-400">{item.amount}</p>
                <p className="mt-2 text-sm text-slate-300 leading-relaxed">{item.finding}</p>
                <p className="mt-4 text-sm text-white font-medium flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                  {item.guard}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-10 text-xs text-slate-500">
            Source: Comptroller &amp; Auditor General of India, Report No. 5 of 2021 (Railways), Chapter 3, paras 3.1.5–3.1.6
            — audit of Price Variation in Works Contracts, 2016-17 to 2018-19. Figures are the CAG&apos;s; IR-PVC is an
            independent tool and is not endorsed by the CAG.
          </p>
        </div>
      </section>

      {/* --- TUTORIAL VIDEOS --- */}
      <section id="tutorials" className="w-full py-14 sm:py-24 bg-slate-50 border-y border-slate-100">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl">
          <div className="text-center max-w-3xl mx-auto mb-16 space-y-4">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white border border-slate-200 text-sm font-semibold text-slate-600 shadow-sm">
              <Play className="w-4 h-4 text-emerald-600 fill-emerald-600" />
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
                className="group block bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm hover:shadow-xl hover:-translate-y-1 hover:border-emerald-100 transition-all duration-300"
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
                      <Play className="w-7 h-7 text-emerald-600 fill-emerald-600 ml-1" />
                    </div>
                  </div>
                  {video.badge && (
                    <div className="absolute top-3 left-3 px-2.5 py-1 bg-orange-500 text-white text-xs font-bold rounded-full">
                      {video.badge}
                    </div>
                  )}
                </div>
                <div className="p-5">
                  <h4 className="font-bold text-slate-900 mb-1 group-hover:text-emerald-600 transition-colors">{video.title}</h4>
                  <p className="text-sm text-slate-500 font-light">{video.desc}</p>
                </div>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* --- POWERFUL TOOLS (MINI FEATURES GRID) --- */}
      <section className="w-full py-14 sm:py-24 bg-white">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl">
          <div className="text-center max-w-3xl mx-auto mb-16 space-y-4">
            <h2 className="text-3xl lg:text-4xl font-extrabold text-slate-900 tracking-tight">The Ultimate Contractor Toolkit</h2>
            <p className="text-lg text-slate-500 font-light">More than a calculator. A complete ecosystem for Indian Railway PVC management.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <MiniFeature icon={<Gift />} title="Free Trial" desc="First PVC bill is completely free for every new user — no credits needed, watermarked PDF" badge="New" />
            <MiniFeature icon={<ReceiptText />} title="IR Standard PDF" desc="Official GCC Cl.46A statement with monthly indices, formula, and provisional watermark" badge="New" />
            <MiniFeature icon={<Layers />} title="Bulk Bill Creation" desc="Create and submit multiple bills simultaneously with one-time zone & fuel setup" badge="New" />
            <MiniFeature icon={<Download />} title="Bulk PDF Download" desc="Download Detailed or IR Standard PDFs for multiple bills merged into one file" badge="New" />
            <MiniFeature icon={<FileSpreadsheet />} title="Excel Contract Import" desc="Import multiple contracts at once via Excel/CSV template — saves hours of manual entry" badge="New" />
            <MiniFeature icon={<ScanSearch />} title="Free PVC Preview" desc="See the full PVC breakdown before paying — no credits deducted for preview calculations" badge="New" />
            <MiniFeature icon={<Send />} title="Telegram Bot" desc="Send agreement + bill PDFs to @Pvcbill_bot and get the PVC in chat — no login, pay per report" badge="New" />
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
      <section className="w-full bg-white py-14 sm:py-24 border-y border-slate-100">
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
            <div className="bg-white rounded-3xl border-2 border-emerald-500 shadow-2xl shadow-emerald-900/10 overflow-hidden">
              <div className="grid grid-cols-1 md:grid-cols-2">
                {/* Left: price */}
                <div className="p-6 sm:p-10 lg:p-12 flex flex-col justify-center border-b md:border-b-0 md:border-r border-slate-100">
                  <p className="text-sm font-semibold text-emerald-600 uppercase tracking-widest mb-3">Per Bill Credit Cost</p>
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                      <p className="text-[11px] font-semibold text-slate-600 mb-1">Manual entry</p>
                      <div className="flex items-end gap-1">
                        <span className="text-4xl font-black text-slate-900">₹{pricing.billCost}</span>
                        <span className="text-slate-500 text-xs pb-1">/ bill</span>
                      </div>
                    </div>
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-4">
                      <p className="text-[11px] font-semibold text-emerald-600 mb-1">AI PDF auto-extract</p>
                      <div className="flex items-end gap-1">
                        <span className="text-4xl font-black text-emerald-700">₹{pricing.aiBillCost}</span>
                        <span className="text-slate-500 text-xs pb-1">/ bill</span>
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-emerald-600 font-semibold mb-3">First bill FREE — one-time trial automatically applied for new users</p>
                  <p className="text-slate-500 font-light text-sm leading-relaxed">
                    You are charged only when a bill is saved. Enter it manually, or upload the bill PDF and let AI extract the items automatically (higher rate). Credits never expire.
                  </p>
                  <div className="mt-6 flex flex-col gap-2">
                    <span className="flex items-center gap-2 text-sm text-slate-600 font-medium"><CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" /> Free PVC preview before paying</span>
                    <span className="flex items-center gap-2 text-sm text-slate-600 font-medium"><CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" /> All PDF formats (Detailed + IR Standard)</span>
                    <span className="flex items-center gap-2 text-sm text-slate-600 font-medium"><CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" /> Bulk bill creation at the same per-bill rates</span>
                    <span className="flex items-center gap-2 text-sm text-slate-600 font-medium"><CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" /> PVC check credit applied if checked recently</span>
                  </div>
                </div>
                {/* Right: credit top-up info */}
                <div className="p-6 sm:p-10 lg:p-12 flex flex-col justify-center bg-slate-50/50">
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
                      <span className="font-semibold text-emerald-600">Never</span>
                    </div>
                  </div>
                  <Link href="/auth/signin?mode=signup" className="mt-6 block">
                    <Button className="w-full h-12 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-lg shadow-emerald-600/20">
                      Get Started — First Bill Free <ArrowRight className="ml-2 w-4 h-4" />
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          </div>

          {/* Advanced Tools Add-on */}
          <div className="mt-12 max-w-4xl mx-auto">
            <div className="relative overflow-hidden bg-gradient-to-r from-emerald-50 via-emerald-50/50 to-emerald-50 border border-emerald-100 rounded-3xl p-8 lg:p-10 flex flex-col md:flex-row items-center justify-between gap-8 hover:shadow-xl hover:border-emerald-200 transition-all duration-300">
              <div className="absolute top-0 right-0 bg-emerald-600 text-[10px] text-white font-extrabold px-4 py-1 rounded-bl-2xl tracking-widest uppercase">
                Add-on Subscription
              </div>
              <div className="space-y-4 text-center md:text-left">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white border border-emerald-200 text-xs font-semibold text-emerald-700">
                  <Gift className="w-3.5 h-3.5 text-emerald-600" />
                  Advanced Contractor Tools
                </div>
                <h3 className="text-2xl font-black text-slate-900 tracking-tight">
                  PVC Check & Work Class Analyzer
                </h3>
                <p className="text-slate-600 text-sm font-light max-w-xl">
                  Unlock unlimited access to the dynamic <strong>PVC Check tool</strong> and <strong>Classification Comparison Analyzer</strong>. Run unlimited checks with zero per-event fees!
                </p>
              </div>
              <div className="text-center shrink-0 space-y-3 bg-white/80 backdrop-blur-md border border-emerald-50 p-6 rounded-2xl min-w-[200px] shadow-sm">
                <div className="flex items-baseline justify-center gap-0.5">
                  <span className="text-4xl font-black text-emerald-600">₹99</span>
                  <span className="text-slate-500 font-medium text-xs">/ month</span>
                </div>
                <p className="text-xs text-slate-400 font-medium">Charged from credit wallet</p>
                <Link href="/auth/signin?mode=signup" className="block">
                  <Button size="sm" className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg shadow-md shadow-emerald-600/10">
                    Get Started Now
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* --- FINAL CTA --- */}
      <section className="w-full bg-white py-20 sm:py-32 text-center">
        <div className="max-w-4xl mx-auto px-6">
          <h2 className="text-4xl md:text-5xl font-black text-slate-900 tracking-tight mb-6">
            Ready to Streamline Your Billing?
          </h2>
          <p className="text-xl text-slate-500 font-light mb-10 max-w-2xl mx-auto">
            Join smart railway contractors across India who use IR-PVC to save hours, eliminate errors, and generate Railway-standard PVC statements instantly.
          </p>
          <div className="flex flex-col items-center justify-center">
            <Link href="/auth/signin?mode=signup" className="inline-block">
              <Button size="lg" className="h-16 px-10 text-xl font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl shadow-xl shadow-emerald-600/20 hover:shadow-2xl hover:-translate-y-1 transition-all duration-300">
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
      <div className="shrink-0 w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center group-hover:scale-110 group-hover:bg-emerald-100 transition-transform duration-300">
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
