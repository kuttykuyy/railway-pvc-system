'use client';

import { BackButton } from '@/components/ui/back-button';
import { Card, CardContent } from '@/components/ui/card';
import { Building2, Target, Users, Award, Shield, Zap, Sparkles, Phone, Mail, Globe, Clock, CheckCircle } from 'lucide-react';
import Link from 'next/link';

export default function AboutUsPage() {
  return (
    <div className="relative min-h-screen pb-16 space-y-8 overflow-hidden bg-slate-950/20">
      {/* Dynamic Background Blurs */}
      <div className="absolute top-0 right-10 w-96 h-96 bg-blue-600/10 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute top-1/3 -left-20 w-80 h-80 bg-indigo-600/8 blur-[100px] rounded-full pointer-events-none" />
      <div className="absolute bottom-10 right-20 w-[450px] h-[450px] bg-purple-600/5 blur-[150px] rounded-full pointer-events-none" />

      <div className="container mx-auto px-4 py-8 max-w-6xl relative z-10 space-y-8">
        <BackButton href="/" className="mb-4 text-slate-300 hover:text-white" />
        
        {/* Organization Banner */}
        <div className="relative flex flex-col items-center justify-center p-10 bg-gradient-to-r from-slate-900/60 to-slate-950/60 backdrop-blur-xl border border-white/5 rounded-3xl shadow-[0_8px_32px_rgba(0,0,0,0.15)] overflow-hidden text-center space-y-4">
          <div className="absolute inset-0 bg-grid-white/[0.02] pointer-events-none" />
          <div className="relative inline-flex items-center justify-center p-4 bg-gradient-to-tr from-blue-600 to-indigo-600 rounded-2xl shadow-xl shadow-indigo-500/10">
            <Building2 className="h-8 w-8 text-white" />
          </div>
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 text-xs font-semibold text-blue-400 bg-blue-500/10 border border-blue-500/20 rounded-full">
              <Sparkles className="h-3 w-3" />
              Southern Railway Contractors Association
            </div>
            <h1 className="text-4xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-300 bg-clip-text text-transparent">
              About IR-PVC Platform
            </h1>
            <p className="text-sm text-slate-400 max-w-2xl mx-auto">
              Developed by the Tiruchirappalli Division, providing modern, accurate, and completely automated Price Variation Clause computation services across Indian Railways.
            </p>
          </div>
        </div>

        {/* Overview Section */}
        <Card className="border border-white/5 bg-slate-900/40 backdrop-blur-md shadow-2xl rounded-3xl overflow-hidden">
          <CardContent className="p-8 space-y-6">
            <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
              <span className="w-1.5 h-6 bg-blue-500 rounded-full" />
              Who We Are
            </h2>
            <div className="space-y-4 text-slate-300 leading-relaxed font-light">
              <p>
                <strong className="text-white font-semibold">IR-PVC (Indian Railway Price Variation Clause Calculator)</strong> is a comprehensive 
                software solution developed by the <strong className="text-white font-semibold">Southern Railway Contractors Association - Tiruchirappalli Division</strong>. 
                Our system is designed specifically for Indian Railway contractors, consultants, and railway officials to streamline the complex process 
                of Price Variation Clause calculations.
              </p>
              <p>
                Our platform automates the tedious manual index checks and formulas required under GCC (General Conditions of Contract) 
                policies, ensuring accuracy, absolute compliance, and significant time savings for railway construction projects.
              </p>
              <p>
                With thousands of railway contracts requiring precise PVC computations monthly, our platform serves as 
                the digital backbone for contractors managing civil works, track maintenance, bridge construction, and 
                infrastructure development under Southern Railway and beyond.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Mission & Vision */}
        <div className="grid md:grid-cols-2 gap-6">
          <Card className="border border-white/5 bg-slate-900/40 backdrop-blur-md shadow-2xl rounded-3xl hover:border-purple-500/20 transition-all duration-300">
            <CardContent className="p-8 space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-purple-500/10 border border-purple-500/20 rounded-2xl text-purple-400">
                  <Target className="h-6 w-6" />
                </div>
                <h3 className="text-xl font-bold text-white">Our Mission</h3>
              </div>
              <p className="text-slate-400 font-light leading-relaxed text-sm">
                To empower railway contractors and officials with cutting-edge automation that eliminates 
                costly calculation errors, ensures 100% GCC compliance, and accelerates the billing process for railway 
                infrastructure projects across India.
              </p>
            </CardContent>
          </Card>

          <Card className="border border-white/5 bg-slate-900/40 backdrop-blur-md shadow-2xl rounded-3xl hover:border-blue-500/20 transition-all duration-300">
            <CardContent className="p-8 space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-2xl text-blue-400">
                  <Award className="h-6 w-6" />
                </div>
                <h3 className="text-xl font-bold text-white">Our Vision</h3>
              </div>
              <p className="text-slate-400 font-light leading-relaxed text-sm">
                To become the most trusted and widely-used PVC calculation platform for Indian Railway projects, 
                setting the industry standard for accuracy, audit transparency, and regulatory compliance in railway 
                contract management.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Key Features */}
        <Card className="border border-white/5 bg-slate-900/40 backdrop-blur-md shadow-2xl rounded-3xl overflow-hidden">
          <CardContent className="p-8 space-y-8">
            <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
              <span className="w-1.5 h-6 bg-blue-500 rounded-full" />
              Why Choose IR-PVC?
            </h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[
                { icon: Shield, title: 'GCC Compliant', desc: 'Fully aligned with Indian Railway GCC policies including GCC-2022, GCC-April 2022, and all official amendments.', color: 'text-purple-400', bg: 'bg-purple-500/10 border-purple-500/20' },
                { icon: Zap, title: 'Automated Calculations', desc: 'Instantly compute PVC for cement, steel, and other components with real-time index data from official sources.', color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20' },
                { icon: Users, title: 'Multi-User Support', desc: 'Role-based access control for contractors, consultants, and railway officials with approval workflows.', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
                { icon: Award, title: 'Professional Reports', desc: 'Generate PDF reports with detailed formulas, ready for submission to railway divisional authorities.', color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' },
                { icon: Building2, title: 'Contract Registry', desc: 'Manage multiple railway contracts, track historical bill intervals, and maintain comprehensive project records.', color: 'text-pink-400', bg: 'bg-pink-500/10 border-pink-500/20' },
                { icon: Clock, title: 'Real-Time Indices', desc: 'Automatic fetching of latest price indices from government WPI and JPC sources with provisional support.', color: 'text-cyan-400', bg: 'bg-cyan-500/10 border-cyan-500/20' },
              ].map((feature, idx) => {
                const IconComp = feature.icon;
                return (
                  <div key={idx} className="flex gap-4 p-4 rounded-2xl bg-slate-950/20 border border-white/5 hover:border-white/10 transition-colors">
                    <div className="flex-shrink-0">
                      <div className={`w-11 h-11 rounded-xl flex items-center justify-center border ${feature.bg} ${feature.color}`}>
                        <IconComp className="h-5 w-5" />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <h4 className="font-bold text-slate-200 text-sm">{feature.title}</h4>
                      <p className="text-xs text-slate-400 leading-relaxed font-light">{feature.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Association Info */}
        <Card className="border border-white/5 bg-slate-900/40 backdrop-blur-md shadow-2xl rounded-3xl overflow-hidden">
          <CardContent className="p-8 space-y-6">
            <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
              <span className="w-1.5 h-6 bg-blue-500 rounded-full" />
              About the Association
            </h2>
            <div className="space-y-4 text-slate-300 leading-relaxed font-light">
              <p>
                The <strong className="text-white font-semibold">Southern Railway Contractors Association - Tiruchirappalli Division</strong> represents 
                registered railway contractors and industry stakeholders in the Tiruchirappalli region. We are committed to supporting contractors 
                in their infrastructure projects through robust technology solutions and deep technical expertise.
              </p>
              <p>
                The IR-PVC platform represents a major technological leap, simplifying compliance, reducing audit friction, 
                and saving contractors and division officials hundreds of manual work hours every month.
              </p>
            </div>
            
            <div className="mt-6 p-5 bg-blue-500/5 rounded-2xl border border-blue-500/10 space-y-4">
              <p className="font-bold text-blue-400 text-sm tracking-wide uppercase leading-none">Official Details</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                <div className="flex items-center gap-2 text-slate-300">
                  <Building2 className="h-4 w-4 text-blue-400" />
                  <span>Southern Railway Contractors Association - TPJ</span>
                </div>
                <div className="flex items-center gap-2 text-slate-300">
                  <Globe className="h-4 w-4 text-blue-400" />
                  <a href="https://irpvc.in" className="hover:underline text-blue-400">irpvc.in</a>
                </div>
                <div className="flex items-center gap-2 text-slate-300">
                  <Mail className="h-4 w-4 text-blue-400" />
                  <a href="mailto:admin@irpvc.in" className="hover:underline text-blue-400">admin@irpvc.in</a>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Pricing Overview */}
        <Card className="border border-white/5 bg-slate-900/40 backdrop-blur-md shadow-2xl rounded-3xl overflow-hidden">
          <CardContent className="p-8 space-y-8">
            <div className="text-center max-w-2xl mx-auto space-y-2">
              <h2 className="text-2xl font-bold text-white tracking-tight">Simple & Transparent Pricing</h2>
              <p className="text-sm text-slate-400 font-light">
                Pay only for what you process. Unlimited access to all reports, features, WPI indices, and support.
              </p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto pt-2">
              {[
                { title: 'Standard Volume', cost: '₹199', desc: '1 to 5 bills per day', detail: 'Base rate billing' },
                { title: 'Medium Volume', cost: '₹159', desc: '6 to 10 bills per day', detail: '20% volume discount' },
                { title: 'High Volume', cost: '₹119', desc: '11+ bills per day', detail: '40% volume discount' },
              ].map((tier, idx) => (
                <div key={idx} className="p-6 bg-slate-950/40 border border-white/5 rounded-2xl text-center space-y-3 hover:border-blue-500/20 transition-all">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">{tier.title}</span>
                  <div className="flex items-baseline justify-center gap-0.5">
                    <span className="text-3xl font-black text-white">{tier.cost}</span>
                    <span className="text-xs text-slate-500">/ bill</span>
                  </div>
                  <p className="text-xs text-slate-400 leading-none">{tier.desc}</p>
                  <span className="inline-block text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md">
                    {tier.detail}
                  </span>
                </div>
              ))}
            </div>

            <div className="max-w-2xl mx-auto text-center pt-2">
              <p className="text-xs text-slate-400 leading-relaxed font-light">
                Your first generated bill is completely free as a trial. Additionally, Railway Officials receive 100% free account tiers for calculation audit, compliance checks, and index oversight.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Call to Action */}
        <div className="relative overflow-hidden p-10 bg-gradient-to-r from-blue-600/20 to-indigo-600/20 backdrop-blur-md border border-blue-500/20 rounded-3xl text-center space-y-6">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-blue-600/10 blur-[80px] rounded-full pointer-events-none" />
          <h2 className="text-2xl font-black text-white tracking-tight relative z-10">Ready to Simplify Your PVC Calculations?</h2>
          <p className="text-slate-300 font-light max-w-2xl mx-auto text-sm relative z-10">
            Join hundreds of railway contractors and officials who trust the IR-PVC platform for rapid, compliant, and completely audited Price Variation Clause statements.
          </p>
          <div className="flex flex-wrap justify-center gap-4 relative z-10 pt-2">
            <Link href="/auth/signin?mode=signup">
              <button className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-lg shadow-blue-600/20 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 text-sm">
                Get Started Free
              </button>
            </Link>
            <Link href="/">
              <button className="px-8 py-3 bg-slate-900 border border-white/10 text-slate-300 rounded-xl font-bold hover:bg-slate-800 transition-colors text-sm">
                Explore Homepage
              </button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

