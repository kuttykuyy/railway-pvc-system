
'use client';

import { BackButton } from '@/components/ui/back-button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Building2, Target, Users, Award, Shield, Zap } from 'lucide-react';

export default function AboutUsPage() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <BackButton href="/" className="mb-6" />
      
      <div className="space-y-8">
        {/* Organization Banner */}
        <Card className="border-0 shadow-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white">
          <CardContent className="py-8">
            <div className="text-center space-y-4">
              <div className="flex justify-center">
                <div className="bg-white/20 p-4 rounded-2xl backdrop-blur-sm">
                  <Building2 className="h-12 w-12 text-white" />
                </div>
              </div>
              <div>
                <h1 className="text-4xl font-bold mb-2">IR-PVC System</h1>
              </div>
              <div className="pt-2 max-w-2xl mx-auto">
                <p className="text-lg text-blue-50">
                  Developed by Southern Railway Contractors Association - Tiruchirappalli Division
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Company Overview */}
        <Card className="border-0 shadow-lg">
          <CardHeader>
            <CardTitle className="text-2xl text-gray-900">Who We Are</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-gray-700 leading-relaxed">
            <p>
              <strong>IR-PVC (Indian Railway Price Variation Clause Calculator)</strong> is a comprehensive 
              software solution developed by the <strong>Southern Railway Contractors Association - Tiruchirappalli Division</strong>, 
              designed specifically for Indian Railway contractors, consultants, and railway officials to streamline the complex process 
              of Price Variation Clause (PVC) calculations.
            </p>
            <p>
              Our platform automates the tedious manual calculations required under GCC (General Conditions of Contract) 
              policies, ensuring accuracy, compliance, and significant time savings for railway projects across India.
            </p>
            <p>
              With thousands of railway contracts requiring precise PVC calculations every month, our system has become 
              an essential tool for contractors managing civil works, track maintenance, bridge construction, and 
              infrastructure development projects under Indian Railways.
            </p>
          </CardContent>
        </Card>

        {/* Mission & Vision */}
        <div className="grid md:grid-cols-2 gap-6">
          <Card className="border-0 shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-xl">
                <Target className="h-6 w-6 text-purple-600" />
                Our Mission
              </CardTitle>
            </CardHeader>
            <CardContent className="text-gray-700 leading-relaxed">
              To empower railway contractors and officials with cutting-edge technology that eliminates 
              calculation errors, ensures GCC compliance, and accelerates the billing process for railway 
              infrastructure projects across India.
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-xl">
                <Award className="h-6 w-6 text-blue-600" />
                Our Vision
              </CardTitle>
            </CardHeader>
            <CardContent className="text-gray-700 leading-relaxed">
              To become the most trusted and widely-used PVC calculation platform for Indian Railway projects, 
              setting the industry standard for accuracy, efficiency, and regulatory compliance in railway 
              contract management.
            </CardContent>
          </Card>
        </div>

        {/* Key Features */}
        <Card className="border-0 shadow-lg">
          <CardHeader>
            <CardTitle className="text-2xl text-gray-900">Why Choose IR-PVC?</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              <div className="flex gap-4">
                <div className="flex-shrink-0">
                  <div className="w-12 h-12 rounded-lg bg-purple-100 flex items-center justify-center">
                    <Shield className="h-6 w-6 text-purple-600" />
                  </div>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 mb-2">GCC Compliant</h3>
                  <p className="text-sm text-gray-600">
                    Fully aligned with Indian Railway GCC policies including GCC-2022, GCC-April 2022, 
                    and all official amendments.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex-shrink-0">
                  <div className="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center">
                    <Zap className="h-6 w-6 text-blue-600" />
                  </div>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 mb-2">Automated Calculations</h3>
                  <p className="text-sm text-gray-600">
                    Instantly compute PVC for cement, steel, and other components with real-time index 
                    data from official sources.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex-shrink-0">
                  <div className="w-12 h-12 rounded-lg bg-green-100 flex items-center justify-center">
                    <Users className="h-6 w-6 text-green-600" />
                  </div>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 mb-2">Multi-User Support</h3>
                  <p className="text-sm text-gray-600">
                    Role-based access control for contractors, consultants, and railway officials with 
                    approval workflows.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex-shrink-0">
                  <div className="w-12 h-12 rounded-lg bg-orange-100 flex items-center justify-center">
                    <Award className="h-6 w-6 text-orange-600" />
                  </div>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 mb-2">Professional Reports</h3>
                  <p className="text-sm text-gray-600">
                    Generate PDF and Excel reports with detailed calculations, ready for submission 
                    to railway authorities.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex-shrink-0">
                  <div className="w-12 h-12 rounded-lg bg-purple-100 flex items-center justify-center">
                    <Building2 className="h-6 w-6 text-purple-600" />
                  </div>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 mb-2">Contract Management</h3>
                  <p className="text-sm text-gray-600">
                    Manage multiple railway contracts, track bill history, and maintain comprehensive 
                    project records.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex-shrink-0">
                  <div className="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center">
                    <Zap className="h-6 w-6 text-blue-600" />
                  </div>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 mb-2">Real-Time Indices</h3>
                  <p className="text-sm text-gray-600">
                    Automatic fetching of latest price indices from government sources with provisional 
                    and final data support.
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Organization Info */}
        <Card className="border-0 shadow-lg">
          <CardHeader>
            <CardTitle className="text-2xl text-gray-900">About the Association</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-gray-700 leading-relaxed">
            <p>
              The <strong>Southern Railway Contractors Association - Tiruchirappalli Division</strong> represents 
              railway contractors and stakeholders in the Tiruchirappalli region. Our mission is to support contractors 
              in their railway projects through technology solutions and industry expertise.
            </p>
            <p>
              The IR-PVC system was developed to address the complex challenges faced by railway contractors in 
              calculating Price Variation Clauses accurately and efficiently. This platform ensures compliance with 
              GCC regulations while saving valuable time and resources.
            </p>
            <div className="mt-6 p-4 bg-purple-50 rounded-lg border border-purple-200">
              <p className="font-semibold text-purple-900 mb-2">Contact Information</p>
              <div className="space-y-1 text-sm text-gray-700">
                <p><strong>Organization:</strong> Southern Railway Contractors Association - Tiruchirappalli Division</p>
                <p><strong>Website:</strong> <a href="https://irpvc.in" className="text-purple-600 hover:underline">irpvc.in</a></p>
                <p><strong>Email:</strong> <a href="mailto:admin@irpvc.in" className="text-purple-600 hover:underline">admin@irpvc.in</a></p>
                <p><strong>Service:</strong> Railway Contract Management Platform</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Pricing Overview */}
        <Card className="border-0 shadow-lg bg-gradient-to-r from-green-50 to-blue-50">
          <CardHeader>
            <CardTitle className="text-2xl text-gray-900 text-center">Simple & Transparent Pricing</CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-6">
            <div className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto">
              <div className="p-6 bg-white rounded-lg shadow-md">
                <div className="text-4xl font-bold text-gray-900 mb-2">₹0</div>
                <div className="text-lg font-semibold text-gray-700 mb-2">1 Free Trial Bill</div>
                <p className="text-sm text-gray-600">
                  Try all features with your first bill completely free. No credit card required.
                </p>
              </div>
              <div className="p-6 bg-purple-50 rounded-lg shadow-md border-2 border-purple-200">
                <div className="text-4xl font-bold text-purple-600 mb-2">₹2,500</div>
                <div className="text-lg font-semibold text-gray-700 mb-2">Per Bill Generated</div>
                <p className="text-sm text-gray-600">
                  Simple pay-per-use pricing. Only pay when you generate bills. No hidden costs.
                </p>
              </div>
            </div>
            <p className="text-gray-700 max-w-2xl mx-auto">
              Get unlimited access to all features including GCC-compliant PVC calculations, PDF & Excel reports, 
              bulk bill generation, 17B compliance support, and automatic index fetching.
            </p>
          </CardContent>
        </Card>

        {/* Call to Action */}
        <Card className="border-0 shadow-lg bg-gradient-to-r from-purple-600 to-blue-600 text-white">
          <CardContent className="py-8 text-center">
            <h2 className="text-2xl font-bold mb-4">Ready to Simplify Your PVC Calculations?</h2>
            <p className="text-purple-100 mb-6 max-w-2xl mx-auto">
              Join hundreds of railway contractors and officials who trust IR-PVC for accurate, 
              compliant, and efficient price variation calculations.
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <a 
                href="/auth/signup" 
                className="px-8 py-3 bg-white text-purple-600 rounded-lg font-semibold hover:bg-purple-50 transition-colors"
              >
                Get Started Free
              </a>
              <a 
                href="/pricing" 
                className="px-8 py-3 bg-purple-700 text-white rounded-lg font-semibold hover:bg-purple-800 transition-colors border border-purple-500"
              >
                View Pricing
              </a>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
