'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import Image from 'next/image';
import {
  Train, Zap, Shield, Calculator, ArrowRight, FileUp, BarChart3,
  CheckCircle, Users, MessageSquare, FileText, LineChart,
  Bot, IndianRupee, Smartphone, Lock, Sparkles,
  TrendingDown, TrendingUp, Percent, Gift, Play
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
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-50 via-white to-indigo-50" />
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-100/40 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3" />
        <div className="absolute bottom-0 left-0 w-72 h-72 bg-indigo-100/40 rounded-full blur-3xl translate-y-1/3 -translate-x-1/4" />

        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 pb-16 sm:pt-16 sm:pb-20">
          <div className="text-center space-y-6">
            {/* Logo */}
            <div className="flex justify-center mb-4">
              <div className="relative w-28 h-28 sm:w-36 sm:h-36 md:w-44 md:h-44">
                <Image
                  src="/srca-logo-official.png"
                  alt="Southern Railway Contractors Association - Tiruchirappalli Division"
                  fill
                  className="object-contain drop-shadow-md"
                  priority
                />
              </div>
            </div>

            <div className="space-y-3">
              <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight">
                <span className="bg-gradient-to-r from-blue-700 via-blue-600 to-indigo-600 bg-clip-text text-transparent">IR-PVC</span>
              </h1>
              <p className="text-lg sm:text-xl md:text-2xl text-gray-700 font-medium">
                Indian Railway Price Variation Clause System
              </p>
            </div>

            <p className="text-base sm:text-lg text-gray-600 max-w-2xl mx-auto leading-relaxed">
              The complete platform for Indian Railway contractors to automate PVC calculations,
              manage contracts, generate bills, and track price indices — all in one place.
            </p>

            <div className="inline-flex items-center gap-2 text-sm text-blue-700 bg-blue-50 border border-blue-200 px-4 py-2 rounded-full">
              <Train className="w-4 h-4" />
              <span>Developed by Southern Railway Contractors Association — Tiruchirappalli Division</span>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-4">
              <Link href="/auth/signin?mode=signup">
                <Button size="lg" className="text-base px-8 py-6 bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-200 hover:shadow-blue-300 transition-all">
                  Get Started Free
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
              <Link href="/auth/signin">
                <Button size="lg" variant="outline" className="text-base px-8 py-6 border-gray-300 hover:border-blue-400">
                  Sign In
                </Button>
              </Link>
            </div>

            {/* Trust indicators */}
            <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 pt-4 text-sm text-gray-500">
              <span className="flex items-center gap-1.5"><CheckCircle className="w-4 h-4 text-green-500" /> Free to start</span>
              <span className="flex items-center gap-1.5"><Shield className="w-4 h-4 text-blue-500" /> GCC 2022 compliant</span>
              <span className="flex items-center gap-1.5"><Smartphone className="w-4 h-4 text-purple-500" /> Works on mobile</span>
            </div>
          </div>
        </div>
      </section>

      {/* Core Features */}
      <section className="bg-white py-16 sm:py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">Everything You Need for PVC</h2>
            <p className="mt-3 text-gray-600 max-w-2xl mx-auto">From contract creation to final bill generation — every step of the PVC workflow automated and simplified.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <FeatureCard
              icon={<FileText className="h-6 w-6" />}
              iconBg="bg-blue-100 text-blue-600"
              title="PVC Bill Generation"
              description="Create running account bills with automatic PVC calculation based on GCC 46A classification codes and quarterly price indices."
            />
            <FeatureCard
              icon={<TrendingDown className="h-6 w-6" />}
              iconBg="bg-orange-100 text-orange-600"
              title="Quick PVC Check"
              description="Check if your PVC is positive or negative in seconds before creating a full bill — flat ₹500 fee, no bill commitment required."
              badge="POPULAR"
            />
            <FeatureCard
              icon={<TrendingUp className="h-6 w-6" />}
              iconBg="bg-emerald-100 text-emerald-600"
              title="Steel PVC Forecast"
              description="Plan your billing timing with quarterly steel PVC projections. See which quarters give positive PVC and estimate future indices with confidence scoring."
              badge="NEW"
            />
            <FeatureCard
              icon={<LineChart className="h-6 w-6" />}
              iconBg="bg-cyan-100 text-cyan-600"
              title="Price Indices Tracking"
              description="Up-to-date PPAC diesel prices, steel JPC rates, and all 10 component indices. View trends with interactive charts."
            />
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="bg-gray-50 py-16 sm:py-20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">How It Works</h2>
            <p className="mt-3 text-gray-600">Get your PVC bills ready in just a few steps</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            {[
              { step: '1', title: 'Add Contract', desc: 'Enter your agreement details, LOA number, base month, and work description.', icon: <FileText className="w-5 h-5" /> },
              { step: '2', title: 'Create Bill', desc: 'Add line items, select GCC classifications, or simply upload your PDF.', icon: <FileUp className="w-5 h-5" /> },
              { step: '3', title: 'Auto PVC Calc', desc: 'System fetches latest indices and calculates component-wise PVC automatically.', icon: <Calculator className="w-5 h-5" /> },
              { step: '4', title: 'Download & Share', desc: 'Download the PVC statement PDF or send it via WhatsApp directly.', icon: <MessageSquare className="w-5 h-5" /> },
            ].map((item) => (
              <div key={item.step} className="text-center space-y-3">
                <div className="mx-auto w-14 h-14 rounded-full bg-blue-600 text-white flex items-center justify-center text-xl font-bold shadow-lg shadow-blue-200">
                  {item.step}
                </div>
                <h3 className="font-semibold text-gray-900 text-lg">{item.title}</h3>
                <p className="text-sm text-gray-600 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Tutorial Videos */}
      <section className="bg-white py-16 sm:py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">Watch & Learn</h2>
            <p className="mt-3 text-gray-600 max-w-2xl mx-auto">Quick video tutorials to help you get started with IR-PVC in minutes.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { title: 'IR-PVC Signup Process', desc: 'Create your account step-by-step', id: 'dnGZqdycfoE' },
              { title: 'How to Add a Contract', desc: 'Add and configure contracts easily', id: 'zx3UbfhG9l4' },
              { title: 'IR-PVC Bill Creation', desc: 'Generate a PVC bill from start to finish', id: 'Xqphs4RHWig' },
            ].map((v) => (
              <a
                key={v.id}
                href={`https://youtu.be/${v.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="group block rounded-xl overflow-hidden border border-gray-200 hover:border-red-400 hover:shadow-xl transition-all bg-white"
              >
                <div className="relative aspect-video bg-gray-100">
                  <img
                    src={`https://img.youtube.com/vi/${v.id}/hqdefault.jpg`}
                    alt={v.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/40 transition">
                    <div className="bg-red-600 group-hover:bg-red-700 rounded-full p-4 shadow-2xl transform group-hover:scale-110 transition">
                      <Play className="h-8 w-8 text-white fill-white" />
                    </div>
                  </div>
                </div>
                <div className="p-5">
                  <h3 className="font-semibold text-gray-900 group-hover:text-red-600 transition text-lg">{v.title}</h3>
                  <p className="text-sm text-gray-600 mt-1.5">{v.desc}</p>
                </div>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* More Features */}
      <section className="bg-white py-16 sm:py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">Packed with Powerful Tools</h2>
            <p className="mt-3 text-gray-600 max-w-2xl mx-auto">Beyond basic PVC calculations — tools that save you hours of manual work every week.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            <MiniFeature icon={<Bot className="w-5 h-5" />} title="AI Assistant" desc="Ask questions about PVC rules, classifications, or your bills" />
            <MiniFeature icon={<MessageSquare className="w-5 h-5" />} title="WhatsApp Notifications" desc="Get bill PDFs and updates delivered to WhatsApp" />
            <MiniFeature icon={<BarChart3 className="w-5 h-5" />} title="Reports & Analytics" desc="Abstract of bills, PVC summaries, and custom report templates" />
            <MiniFeature icon={<Users className="w-5 h-5" />} title="Multi-User Access" desc="Role-based access for contractors, officials, and admins" />
            <MiniFeature icon={<IndianRupee className="w-5 h-5" />} title="GST Invoicing" desc="Automatic GST invoice generation for every payment" />
            <MiniFeature icon={<Lock className="w-5 h-5" />} title="Extension Compliance" desc="Handle time extensions with proper PVC restriction rules" />
            <MiniFeature icon={<Sparkles className="w-5 h-5" />} title="AI Classification" desc="AI suggests the best GCC code for your work items" />
            <MiniFeature icon={<Smartphone className="w-5 h-5" />} title="Mobile Friendly" desc="Full functionality on phones and tablets" />
          </div>
        </div>
      </section>



      {/* Pricing & Discounts */}
      <section className="bg-gray-50 py-16 sm:py-20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">Simple, Volume-Friendly Pricing</h2>
            <p className="mt-3 text-gray-600 max-w-2xl mx-auto">Process more bills in a day, pay less per bill. Plus get extra savings on negative PVC bills.</p>
          </div>

          {/* Daily Tier Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
            {/* Tier 1 */}
            <div className="relative bg-white rounded-2xl border border-gray-200 p-6 text-center shadow-sm hover:shadow-md transition-shadow">
              <div className="text-sm font-medium text-gray-500 mb-1">Bills 1 – 5 per day</div>
              <div className="text-4xl font-extrabold text-gray-900 mt-2">₹2,500</div>
              <div className="text-sm text-gray-500 mt-1">per bill</div>
              <div className="mt-4 pt-4 border-t border-gray-100 text-sm text-gray-600">Standard rate — full price</div>
            </div>

            {/* Tier 2 */}
            <div className="relative bg-white rounded-2xl border-2 border-blue-400 p-6 text-center shadow-md hover:shadow-lg transition-shadow ring-1 ring-blue-100">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 bg-blue-600 text-white text-xs font-semibold rounded-full">POPULAR</div>
              <div className="text-sm font-medium text-gray-500 mb-1">Bills 6 – 10 per day</div>
              <div className="text-4xl font-extrabold text-blue-700 mt-2">₹2,000</div>
              <div className="text-sm text-gray-500 mt-1">per bill</div>
              <div className="mt-4 pt-4 border-t border-blue-50 flex items-center justify-center gap-1.5 text-sm font-medium text-green-600">
                <Percent className="w-4 h-4" /> 20% discount
              </div>
            </div>

            {/* Tier 3 */}
            <div className="relative bg-white rounded-2xl border border-gray-200 p-6 text-center shadow-sm hover:shadow-md transition-shadow">
              <div className="text-sm font-medium text-gray-500 mb-1">Bills 11+ per day</div>
              <div className="text-4xl font-extrabold text-gray-900 mt-2">₹1,500</div>
              <div className="text-sm text-gray-500 mt-1">per bill</div>
              <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-center gap-1.5 text-sm font-medium text-green-600">
                <Percent className="w-4 h-4" /> 40% discount
              </div>
            </div>
          </div>

          {/* Negative PVC Bonus */}
          <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-2xl p-6 sm:p-8 flex flex-col sm:flex-row items-center gap-5">
            <div className="flex-shrink-0 w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center">
              <TrendingDown className="w-7 h-7 text-emerald-600" />
            </div>
            <div className="text-center sm:text-left flex-1">
              <h3 className="text-lg font-semibold text-gray-900">Negative PVC? Get 50% Off</h3>
              <p className="text-sm text-gray-600 mt-1 leading-relaxed">
                When the total PVC value of a bill is negative, an additional <span className="font-semibold text-emerald-700">50% discount</span> is applied on top of any daily tier discount. Both discounts stack — for example, bill #7 with negative PVC costs just <span className="font-semibold">₹1,000</span>.
              </p>
            </div>
          </div>

          {/* Fine print */}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-gray-400">
            <span className="flex items-center gap-1"><Gift className="w-3.5 h-3.5" /> 1 free trial bill for every new account</span>
            <span className="flex items-center gap-1"><CheckCircle className="w-3.5 h-3.5" /> Daily bill count resets at midnight</span>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-700 py-16 sm:py-20">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">Start Generating PVC Bills Today</h2>
          <p className="text-blue-100 text-lg mb-8 max-w-xl mx-auto">
            Join railway contractors across Southern Railway who are saving hours every week with automated PVC calculations.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/auth/signin?mode=signup">
              <Button size="lg" className="text-base px-8 py-6 bg-white text-blue-700 hover:bg-blue-50 shadow-lg">
                Create Free Account
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
            <Link href="/about">
              <Button size="lg" className="text-base px-8 py-6 bg-blue-500 text-white hover:bg-blue-400 border border-white/30">
                Learn More
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}

function FeatureCard({ icon, iconBg, title, description, badge }: {
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  description: string;
  badge?: string;
}) {
  return (
    <div className="group bg-white p-6 rounded-xl border border-gray-200 hover:border-blue-200 hover:shadow-lg transition-all duration-300">
      <div className={`inline-flex p-3 rounded-lg ${iconBg} mb-4`}>
        {icon}
      </div>
      <h3 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
        {title}
        {badge && (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-emerald-100 text-emerald-700">
            {badge}
          </span>
        )}
      </h3>
      <p className="text-sm text-gray-600 leading-relaxed">{description}</p>
    </div>
  );
}

function MiniFeature({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="flex items-start gap-3 p-4 rounded-lg hover:bg-gray-50 transition-colors">
      <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
        {icon}
      </div>
      <div>
        <h4 className="font-medium text-gray-900 text-sm">{title}</h4>
        <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}
