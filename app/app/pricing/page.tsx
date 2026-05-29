
'use client';

import { BackButton } from '@/components/ui/back-button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Check, IndianRupee, Zap, Building2, Users, Crown } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function PricingPage() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <BackButton href="/" className="mb-6" />
      
      <div className="space-y-8">
        {/* Header Section */}
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold text-gray-900">Simple, Transparent Pricing</h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Choose the plan that fits your railway contract management needs. No hidden fees, cancel anytime.
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-2 gap-8 mt-12 max-w-4xl mx-auto">
          {/* Free Trial Plan */}
          <Card className="border-2 border-gray-200 shadow-lg hover:shadow-xl transition-shadow">
            <CardHeader className="text-center pb-8">
              <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
                <Zap className="h-8 w-8 text-gray-600" />
              </div>
              <CardTitle className="text-2xl mb-2">Free Trial</CardTitle>
              <div className="flex items-center justify-center gap-2 text-4xl font-bold text-gray-900">
                <IndianRupee className="h-8 w-8" />
                <span>0</span>
              </div>
              <p className="text-gray-600 mt-2">1 Bill Free</p>
            </CardHeader>
            <CardContent className="space-y-6">
              <ul className="space-y-3">
                <li className="flex items-start gap-3">
                  <Check className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <span className="text-gray-700">Create 1 free bill</span>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <span className="text-gray-700">1 contract management</span>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <span className="text-gray-700">Full PVC calculations</span>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <span className="text-gray-700">PDF report generation</span>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <span className="text-gray-700">GCC compliant calculations</span>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <span className="text-gray-700">All features included</span>
                </li>
              </ul>
              <Button className="w-full bg-gray-600 hover:bg-gray-700" asChild>
                <a href="/auth/signup">Start Free Trial</a>
              </Button>
              <p className="text-xs text-center text-gray-500">No credit card required</p>
            </CardContent>
          </Card>

          {/* Professional Plan */}
          <Card className="border-2 border-purple-500 shadow-xl hover:shadow-2xl transition-shadow relative">
            <div className="absolute -top-4 left-1/2 -translate-x-1/2">
              <span className="bg-purple-600 text-white px-4 py-1 rounded-full text-sm font-semibold">
                Pay Per Bill
              </span>
            </div>
            <CardHeader className="text-center pb-8 pt-8">
              <div className="w-16 h-16 rounded-full bg-purple-100 flex items-center justify-center mx-auto mb-4">
                <Building2 className="h-8 w-8 text-purple-600" />
              </div>
              <CardTitle className="text-2xl mb-2">Professional</CardTitle>
              <div className="flex items-center justify-center gap-2 text-4xl font-bold text-purple-600">
                <IndianRupee className="h-8 w-8" />
                <span>2,500</span>
              </div>
              <p className="text-gray-600 mt-2">Per bill generated</p>
            </CardHeader>
            <CardContent className="space-y-6">
              <ul className="space-y-3">
                <li className="flex items-start gap-3">
                  <Check className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <span className="text-gray-700">Unlimited bills</span>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <span className="text-gray-700">Unlimited contracts</span>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <span className="text-gray-700">Advanced PVC calculations</span>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <span className="text-gray-700">PDF & Excel reports</span>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <span className="text-gray-700">Bulk bill generation</span>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <span className="text-gray-700">17B compliance support</span>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <span className="text-gray-700">Email support</span>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <span className="text-gray-700">Auto index fetching</span>
                </li>
              </ul>
              <Button className="w-full bg-purple-600 hover:bg-purple-700" asChild>
                <a href="/auth/signup">Get Started</a>
              </Button>
              <p className="text-xs text-center text-gray-500">Pay only when you generate bills</p>
            </CardContent>
          </Card>
        </div>

        {/* CTA Section */}
        <Card className="border-0 shadow-lg bg-gradient-to-r from-purple-600 to-blue-600 text-white mt-8">
          <CardContent className="py-12 text-center">
            <h2 className="text-3xl font-bold mb-4">Ready to Get Started?</h2>
            <p className="text-purple-100 mb-8 max-w-2xl mx-auto text-lg">
              Start your free trial today and experience hassle-free PVC calculations for your railway projects.
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <Button size="lg" className="bg-white text-purple-600 hover:bg-purple-50" asChild>
                <a href="/auth/signup">Start Free Trial</a>
              </Button>
              <Button size="lg" variant="outline" className="border-white text-white hover:bg-purple-700 bg-purple-600" asChild>
                <a href="/contact">Contact Sales</a>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
