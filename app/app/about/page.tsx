'use client';

import { BackButton } from '@/components/ui/back-button';
import { Card, CardContent } from '@/components/ui/card';
import { Building2, Target, Users, Award, Shield, Zap, Sparkles, Phone, Mail, Globe, Clock, CheckCircle } from 'lucide-react';
import Link from 'next/link';

export default function AboutUsPage() {
  return (
    <div className="relative min-h-screen pb-16 space-y-8 overflow-hidden bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/50">
      {/* Decorative Light Backdrops */}
      <div className="absolute top-0 right-10 w-96 h-96 bg-blue-300/10 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute top-1/3 -left-20 w-80 h-80 bg-indigo-300/10 blur-[100px] rounded-full pointer-events-none" />
      <div className="absolute bottom-10 right-20 w-[450px] h-[450px] bg-purple-300/5 blur-[150px] rounded-full pointer-events-none" />

      <div className="container mx-auto px-4 py-8 max-w-6xl relative z-10 space-y-8">
        <BackButton href="/" variant="outline" className="mb-4 border-slate-200/80 bg-white/80 hover:bg-slate-50 text-slate-600 hover:text-slate-800" />
        
        {/* Organization Banner */}
        <div className="relative flex flex-col items-center justify-center p-10 bg-white/80 backdrop-blur-xl border border-slate-200/50 rounded-3xl shadow-[0_10px_40px_rgba(0,0,0,0.03)] overflow-hidden text-center space-y-4">
          <div className="absolute inset-0 bg-grid-slate-900/[0.01] pointer-events-none" />
          <div className="relative inline-flex items-center justify-center p-4 bg-gradient-to-tr from-blue-600 to-indigo-600 rounded-2xl shadow-lg shadow-indigo-500/20">
            <Building2 className="h-8 w-8 text-white" />
          </div>
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3.5 py-1 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200/50 rounded-full">
              <Sparkles className="h-3 w-3 text-blue-600 animate-pulse" />
              Southern Railway Contractors Association
            </div>
            <h1 className="text-4xl sm:text-5xl font-black tracking-tight bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 bg-clip-text text-transparent">
              About IR-PVC Platform
            </h1>
            <p className="text-sm sm:text-base text-slate-500 max-w-2xl mx-auto font-normal">
              Developed by the Tiruchirappalli Division, providing modern, accurate, and completely automated Price Variation Clause computation services across Indian Railways.
            </p>
          </div>
        </div>

        {/* Overview Section - Two Column Grid to avoid empty space */}
        <div className="grid lg:grid-cols-12 gap-8 items-stretch">
          <Card className="lg:col-span-7 border border-slate-100 bg-white/70 backdrop-blur-md shadow-[0_15px_35px_rgba(0,0,0,0.02)] rounded-3xl overflow-hidden flex flex-col justify-between">
            <CardContent className="p-8 space-y-6">
              <h2 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                <span className="w-1.5 h-6 bg-blue-600 rounded-full" />
                Who We Are
              </h2>
              <div className="space-y-4 text-slate-600 leading-relaxed font-normal text-sm sm:text-base">
                <p>
                  <strong className="text-slate-900 font-bold">IR-PVC (Indian Railway Price Variation Clause Calculator)</strong> is a comprehensive 
                  software solution developed by the <strong className="text-slate-900 font-bold">Southern Railway Contractors Association - Tiruchirappalli Division</strong>. 
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

          {/* Quick Stats Panel / Key Highlights - Fills empty space dynamically */}
          <div className="lg:col-span-5 flex flex-col justify-stretch">
            <Card className="border border-slate-100 bg-white/70 backdrop-blur-md shadow-[0_15px_35px_rgba(0,0,0,0.02)] rounded-3xl p-8 flex flex-col justify-center flex-grow">
              <h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-indigo-600" />
                Platform Highlights
              </h3>
              <div className="space-y-6">
                {[
                  { label: "GCC Compliance", val: "100%", desc: "Aligned with GCC 2022 & latest amendments.", icon: Shield, color: "text-purple-600 bg-purple-50 border-purple-100" },
                  { label: "Average Time Saved", val: "95%", desc: "Reduces manual effort from hours to seconds.", icon: Clock, color: "text-blue-600 bg-blue-50 border-blue-100" },
                  { label: "Active Division", val: "TPJ", desc: "Initiated by Tiruchirappalli Contractors.", icon: Building2, color: "text-amber-600 bg-amber-50 border-amber-100" }
                ].map((stat, idx) => (
                  <div key={idx} className="flex items-center justify-between p-4 bg-slate-50/60 border border-slate-100 rounded-2xl hover:bg-slate-50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className={`p-2.5 rounded-xl border ${stat.color}`}>
                        <stat.icon className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{stat.label}</p>
                        <p className="text-xs text-slate-400 font-light mt-0.5">{stat.desc}</p>
                      </div>
                    </div>
                    <span className="text-2xl font-black text-slate-800 tracking-tight">{stat.val}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>

        {/* Mission & Vision */}
        <div className="grid md:grid-cols-2 gap-6">
          <Card className="border border-slate-100 bg-white/70 backdrop-blur-md shadow-[0_15px_35px_rgba(0,0,0,0.02)] rounded-3xl hover:border-purple-200/50 hover:shadow-lg transition-all duration-300">
            <CardContent className="p-8 space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-purple-50 border border-purple-100 rounded-2xl text-purple-600">
                  <Target className="h-6 w-6" />
                </div>
                <h3 className="text-xl font-black text-slate-900">Our Mission</h3>
              </div>
              <p className="text-slate-600 font-normal leading-relaxed text-sm">
                To empower railway contractors and officials with cutting-edge automation that eliminates 
                costly calculation errors, ensures 100% GCC compliance, and accelerates the billing process for railway 
                infrastructure projects across India.
              </p>
            </CardContent>
          </Card>

          <Card className="border border-slate-100 bg-white/70 backdrop-blur-md shadow-[0_15px_35px_rgba(0,0,0,0.02)] rounded-3xl hover:border-blue-200/50 hover:shadow-lg transition-all duration-300">
            <CardContent className="p-8 space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-blue-50 border border-blue-100 rounded-2xl text-blue-600">
                  <Award className="h-6 w-6" />
                </div>
                <h3 className="text-xl font-black text-slate-900">Our Vision</h3>
              </div>
              <p className="text-slate-600 font-normal leading-relaxed text-sm">
                To become the most trusted and widely-used PVC calculation platform for Indian Railway projects, 
                setting the industry standard for accuracy, audit transparency, and regulatory compliance in railway 
                contract management.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Key Features */}
        <Card className="border border-slate-100 bg-white/70 backdrop-blur-md shadow-[0_15px_35px_rgba(0,0,0,0.02)] rounded-3xl overflow-hidden">
          <CardContent className="p-8 space-y-8">
            <h2 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
              <span className="w-1.5 h-6 bg-blue-600 rounded-full" />
              Why Choose IR-PVC?
            </h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[
                { icon: Shield, title: 'GCC Compliant', desc: 'Fully aligned with Indian Railway GCC policies including GCC-2022, GCC-April 2022, and all official amendments.', color: 'text-purple-600', bg: 'bg-purple-50 border-purple-100' },
                { icon: Zap, title: 'Automated Calculations', desc: 'Instantly compute PVC for cement, steel, and other components with real-time index data from official sources.', color: 'text-blue-600', bg: 'bg-blue-50 border-blue-100' },
                { icon: Users, title: 'Multi-User Support', desc: 'Role-based access control for contractors, consultants, and railway officials with approval workflows.', color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-100' },
                { icon: Award, title: 'Professional Reports', desc: 'Generate PDF reports with detailed formulas, ready for submission to railway divisional authorities.', color: 'text-amber-600', bg: 'bg-amber-50 border-amber-100' },
                { icon: Building2, title: 'Contract Registry', desc: 'Manage multiple railway contracts, track historical bill intervals, and maintain comprehensive project records.', color: 'text-pink-600', bg: 'bg-pink-50 border-pink-100' },
                { icon: Clock, title: 'Real-Time Indices', desc: 'Automatic fetching of latest price indices from government WPI and JPC sources with provisional support.', color: 'text-cyan-600', bg: 'bg-cyan-50 border-cyan-100' },
              ].map((feature, idx) => {
                const IconComp = feature.icon;
                return (
                  <div key={idx} className="flex gap-4 p-4 rounded-2xl bg-slate-50/50 border border-slate-100 hover:bg-white hover:border-blue-200/50 hover:shadow-md transition-all duration-300">
                    <div className="flex-shrink-0">
                      <div className={`w-11 h-11 rounded-xl flex items-center justify-center border ${feature.bg} ${feature.color}`}>
                        <IconComp className="h-5 w-5" />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <h4 className="font-bold text-slate-800 text-sm">{feature.title}</h4>
                      <p className="text-xs text-slate-500 leading-relaxed font-light">{feature.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Association Info - Two Column Layout to avoid empty space */}
        <div className="grid lg:grid-cols-12 gap-8 items-stretch">
          <Card className="lg:col-span-7 border border-slate-100 bg-white/70 backdrop-blur-md shadow-[0_15px_35px_rgba(0,0,0,0.02)] rounded-3xl overflow-hidden flex flex-col justify-between">
            <CardContent className="p-8 space-y-6">
              <h2 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                <span className="w-1.5 h-6 bg-blue-600 rounded-full" />
                About the Association
              </h2>
              <div className="space-y-4 text-slate-600 leading-relaxed font-normal text-sm sm:text-base">
                <p>
                  The <strong className="text-slate-900 font-bold">Southern Railway Contractors Association - Tiruchirappalli Division</strong> represents 
                  registered railway contractors and industry stakeholders in the Tiruchirappalli region. We are committed to supporting contractors 
                  in their infrastructure projects through robust technology solutions and deep technical expertise.
                </p>
                <p>
                  The IR-PVC platform represents a major technological leap, simplifying compliance, reducing audit friction, 
                  and saving contractors and division officials hundreds of manual work hours every month.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Official Contact Details Box - dynamic right-side balance */}
          <div className="lg:col-span-5 flex flex-col justify-stretch">
            <Card className="border border-slate-100 bg-gradient-to-br from-blue-50/50 to-indigo-50/50 backdrop-blur-md shadow-[0_15px_35px_rgba(0,0,0,0.02)] rounded-3xl p-8 flex flex-col justify-center space-y-6 flex-grow">
              <div>
                <p className="font-black text-blue-700 text-xs tracking-wider uppercase">Official Association Details</p>
                <p className="text-xs text-slate-500 mt-1 font-light">Tiruchirappalli Division Contacts</p>
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-3 p-3 bg-white/60 border border-slate-100 rounded-xl">
                  <div className="p-2 bg-blue-100 text-blue-700 rounded-lg">
                    <Building2 className="h-4 w-4" />
                  </div>
                  <span className="text-xs font-semibold text-slate-700">SR Contractors Association - TPJ</span>
                </div>
                
                <a href="https://irpvc.in" target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 p-3 bg-white/60 border border-slate-100 rounded-xl hover:border-blue-300 hover:bg-white transition-all group">
                  <div className="p-2 bg-indigo-100 text-indigo-700 rounded-lg group-hover:bg-blue-600 group-hover:text-white transition-colors">
                    <Globe className="h-4 w-4" />
                  </div>
                  <span className="text-xs font-semibold text-indigo-600 group-hover:text-blue-700">irpvc.in</span>
                </a>

                <a href="mailto:admin@irpvc.in" className="flex items-center gap-3 p-3 bg-white/60 border border-slate-100 rounded-xl hover:border-blue-300 hover:bg-white transition-all group">
                  <div className="p-2 bg-emerald-100 text-emerald-700 rounded-lg group-hover:bg-blue-600 group-hover:text-white transition-colors">
                    <Mail className="h-4 w-4" />
                  </div>
                  <span className="text-xs font-semibold text-emerald-600 group-hover:text-blue-700">admin@irpvc.in</span>
                </a>
              </div>
            </Card>
          </div>
        </div>

        {/* Pricing Overview */}
        <Card className="border border-slate-100 bg-white/70 backdrop-blur-md shadow-[0_15px_35px_rgba(0,0,0,0.02)] rounded-3xl overflow-hidden">
          <CardContent className="p-8 space-y-8">
            <div className="text-center max-w-2xl mx-auto space-y-2">
              <h2 className="text-2xl font-black text-slate-900 tracking-tight">Simple & Transparent Pricing</h2>
              <p className="text-sm text-slate-500 font-light">
                Pay only for what you process. Unlimited access to all reports, features, WPI indices, and support.
              </p>
            </div>
            
            <div className="max-w-md mx-auto pt-2">
              <div className="p-8 rounded-3xl text-center space-y-4 transition-all duration-300 relative overflow-hidden bg-gradient-to-b from-blue-50/50 to-white shadow-[0_8px_30px_rgba(37,99,235,0.08)] border border-blue-200 hover:shadow-lg">
                <span className="text-xs font-bold text-blue-600 uppercase tracking-widest block">Flat Rate Pricing</span>
                <div className="flex items-baseline justify-center gap-0.5">
                  <span className="text-5xl font-black text-slate-900">₹199</span>
                  <span className="text-sm text-slate-500 font-medium">/ bill</span>
                </div>
                <p className="text-sm text-slate-655 font-medium leading-relaxed">
                  Simple pay-as-you-go credit system. No monthly subscription or lock-in.
                </p>
                <span className="inline-block text-[11px] font-extrabold px-3 py-1 rounded-md text-emerald-700 bg-emerald-100/70">
                  First Bill is FREE (Trial Active)
                </span>
              </div>
            </div>

            <div className="max-w-3xl mx-auto text-center pt-4 border-t border-slate-100">
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-50/60 border border-emerald-100/50 rounded-2xl text-xs text-emerald-800 max-w-2xl mx-auto leading-relaxed">
                <CheckCircle className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                <span>
                  <strong>Railway Official Exemption:</strong> Registered Railway Department officials receive 100% free accounts for validation, audit check, and WPI index monitoring.
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Call to Action */}
        <div className="relative overflow-hidden p-10 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-3xl text-center space-y-6 shadow-xl shadow-blue-500/10">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-white/5 blur-[80px] rounded-full pointer-events-none" />
          <h2 className="text-2xl sm:text-3xl font-black tracking-tight relative z-10">Ready to Simplify Your PVC Calculations?</h2>
          <p className="text-blue-100 font-light max-w-2xl mx-auto text-sm sm:text-base relative z-10">
            Join hundreds of railway contractors and officials who trust the IR-PVC platform for rapid, compliant, and completely audited Price Variation Clause statements.
          </p>
          <div className="flex flex-wrap justify-center gap-4 relative z-10 pt-2">
            <Link href="/auth/signin?mode=signup">
              <button className="px-8 py-3 bg-white hover:bg-blue-50 text-blue-700 rounded-xl font-bold shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 text-sm">
                Get Started Now
              </button>
            </Link>
            <Link href="/">
              <button className="px-8 py-3 bg-blue-700/40 border border-white/20 text-white rounded-xl font-bold hover:bg-blue-700/60 transition-colors text-sm">
                Explore Homepage
              </button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
