'use client';

import { BackButton } from '@/components/ui/back-button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Shield, Sparkles, Building2, Mail, Phone, Calendar } from 'lucide-react';

export default function PrivacyPolicyPage() {
  return (
    <div className="relative min-h-screen pb-16 space-y-8 overflow-hidden bg-gradient-to-br from-slate-50 via-emerald-50/30 to-emerald-50/50">
      {/* Decorative Light Backdrops */}
      <div className="absolute top-0 right-10 w-96 h-96 bg-emerald-300/10 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute top-1/3 -left-20 w-80 h-80 bg-emerald-300/10 blur-[100px] rounded-full pointer-events-none" />
      <div className="absolute bottom-10 right-20 w-[450px] h-[450px] bg-emerald-300/5 blur-[150px] rounded-full pointer-events-none" />

      <div className="container mx-auto px-4 py-8 max-w-4xl relative z-10 space-y-8">
        <BackButton href="/" variant="outline" className="mb-4 border-slate-200/80 bg-white/80 hover:bg-slate-50 text-slate-600 hover:text-slate-800" />
        
        <Card className="border border-slate-100 bg-white/70 backdrop-blur-md shadow-[0_15px_35px_rgba(0,0,0,0.02)] rounded-3xl overflow-hidden">
          <CardHeader className="p-8 sm:p-10 border-b border-slate-100 bg-gradient-to-r from-emerald-500/5 to-emerald-500/5">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-2xl text-emerald-600">
                <Shield className="h-7 w-7" />
              </div>
              <div>
                <CardTitle className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                  Privacy Policy
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
                <span className="w-1 h-5 bg-emerald-500 rounded-full" />
                1. Introduction
              </h3>
              <p>
                This Privacy Policy describes how <strong className="text-slate-900 font-bold">Indian Railway Price Variation Clause Calculator (IR-PVC)</strong> ("we", "us", or "our") collects, 
                uses, and protects your personal information when you use our service at <a href="https://irpvc.in" target="_blank" rel="noopener noreferrer" className="text-emerald-600 hover:underline">irpvc.in</a>. We are committed to ensuring 
                that your privacy is protected and compliant with relevant regulations.
              </p>
            </section>

            <section className="space-y-4">
              <h3 className="text-lg font-black text-slate-800 tracking-tight flex items-center gap-2">
                <span className="w-1 h-5 bg-emerald-500 rounded-full" />
                2. Information We Collect
              </h3>
              
              <div className="grid md:grid-cols-3 gap-6 pt-2">
                <div className="p-5 bg-slate-50/60 border border-slate-100 rounded-2xl">
                  <h4 className="font-bold text-slate-800 text-sm mb-2.5">2.1 Personal Data</h4>
                  <ul className="list-disc pl-4 space-y-1.5 text-xs text-slate-500">
                    <li>Full name & contact details</li>
                    <li>Email address & phone number</li>
                    <li>Organization & company name</li>
                    <li>Payment verification details</li>
                  </ul>
                </div>

                <div className="p-5 bg-slate-50/60 border border-slate-100 rounded-2xl">
                  <h4 className="font-bold text-slate-800 text-sm mb-2.5">2.2 Contract & Bill Data</h4>
                  <ul className="list-disc pl-4 space-y-1.5 text-xs text-slate-500">
                    <li>Contract numbers, dates, values</li>
                    <li>Work descriptions & classifications</li>
                    <li>Calculations & intervals</li>
                    <li>Uploaded PDFs and abstracts</li>
                  </ul>
                </div>

                <div className="p-5 bg-slate-50/60 border border-slate-100 rounded-2xl">
                  <h4 className="font-bold text-slate-800 text-sm mb-2.5">2.3 System & Usage</h4>
                  <ul className="list-disc pl-4 space-y-1.5 text-xs text-slate-500">
                    <li>Login timestamps and actions</li>
                    <li>IP addresses & device details</li>
                    <li>Browser type & versions</li>
                    <li>Performance logs</li>
                  </ul>
                </div>
              </div>
            </section>

            <section className="space-y-3">
              <h3 className="text-lg font-black text-slate-800 tracking-tight flex items-center gap-2">
                <span className="w-1 h-5 bg-emerald-500 rounded-full" />
                3. How We Use Your Information
              </h3>
              <p>We process your information strictly for the following operational reasons:</p>
              <ul className="list-disc pl-6 space-y-1 text-slate-600 text-sm">
                <li>To provide and maintain our GCC-compliant calculation services</li>
                <li>To generate precise running account bills and PDF reports</li>
                <li>To manage your manual payment records and credit allocation</li>
                <li>To secure access to your account and diagnose calculation queries</li>
                <li>To detect, prevent, and debug potential security issues or fraud</li>
                <li>To send important service or index update notifications</li>
              </ul>
            </section>

            <section className="space-y-3">
              <h3 className="text-lg font-black text-slate-800 tracking-tight flex items-center gap-2">
                <span className="w-1 h-5 bg-emerald-500 rounded-full" />
                4. Data Storage and Security
              </h3>
              <p>
                We implement robust technical measures to safeguard your information:
              </p>
              <ul className="list-disc pl-6 space-y-1 text-slate-600 text-sm">
                <li>All user and calculation data is encrypted in transit and at rest using modern secure protocols.</li>
                <li>User passwords are securely hashed using <strong className="text-slate-800">bcrypt</strong> encryption and cannot be read by system administrators.</li>
                <li>Access to the contract database is strictly restricted to authorized platform personnel.</li>
                <li>Regular automated backups are taken to avoid data loss.</li>
              </ul>
            </section>

            <section className="space-y-3">
              <h3 className="text-lg font-black text-slate-800 tracking-tight flex items-center gap-2">
                <span className="w-1 h-5 bg-emerald-500 rounded-full" />
                5. Data Sharing and Disclosure
              </h3>
              <p>
                We respect your privacy: <strong className="text-slate-800">we do not sell, rent, or trade your personal or contract information with third parties.</strong> We may share data only with hosting partners or when legally compelled by court orders or Indian Railway administrative regulations.
              </p>
            </section>

            <section className="space-y-3">
              <h3 className="text-lg font-black text-slate-800 tracking-tight flex items-center gap-2">
                <span className="w-1 h-5 bg-emerald-500 rounded-full" />
                6. Your Rights
              </h3>
              <p>
                You have full control over your data. You may request access to a copy of your contract lists, edit details, delete your processed bills, or permanently terminate your account by contacting our division administrator.
              </p>
            </section>

            <section className="space-y-3">
              <h3 className="text-lg font-black text-slate-800 tracking-tight flex items-center gap-2">
                <span className="w-1 h-5 bg-emerald-500 rounded-full" />
                7. Cookies and Tracking
              </h3>
              <p>
                We only use essential functional cookies required to maintain secure user sessions. We do not place any third-party marketing, analytics, or behavioral tracking cookies on your device.
              </p>
            </section>

            <section className="space-y-4">
              <h3 className="text-lg font-black text-slate-800 tracking-tight flex items-center gap-2">
                <span className="w-1 h-5 bg-emerald-500 rounded-full" />
                8. Contact & Administration
              </h3>
              <p>
                For data access requests or privacy-related questions, please contact our administrator:
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

            <section className="space-y-3 pt-4 border-t border-slate-100 text-xs text-slate-400 font-light">
              <p>
                This Privacy Policy is designed to comply with the Information Technology Act, 2000, and other applicable Indian digital data security regulations. We may update this policy periodically, and continued use of the platform represents your acceptance of updates.
              </p>
            </section>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
