
'use client';

import { BackButton } from '@/components/ui/back-button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Phone, Mail, Globe, MapPin, Clock, User, MessageCircle } from 'lucide-react';
import Link from 'next/link';

export default function ContactPage() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <BackButton href="/" className="mb-6" />
      
      <div className="space-y-6">
        {/* Header */}
        <Card className="border-0 shadow-lg bg-gradient-to-r from-blue-50 to-indigo-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-3 text-2xl">
              <MessageCircle className="h-7 w-7 text-blue-600" />
              Contact Us
            </CardTitle>
            <p className="text-gray-600 mt-2">
              We're here to help! Reach out to us for support, billing inquiries, or technical assistance.
            </p>
          </CardHeader>
        </Card>

        {/* Primary Contact */}
        <Card className="border-0 shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl text-gray-900">
              <User className="h-6 w-6 text-blue-600" />
              Primary Contact
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="bg-blue-50 p-6 rounded-lg border border-blue-200">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center text-white text-2xl font-bold">
                  PK
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-900">Prasath Kumar</h3>
                  <p className="text-gray-600">System Administrator & Support</p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 mt-6">
                <div className="flex items-center gap-3 bg-white p-6 rounded-lg border-2 border-green-200">
                  <Phone className="h-7 w-7 text-green-600 flex-shrink-0" />
                  <div>
                    <p className="text-sm text-gray-500 mb-1">Contact Number (WhatsApp)</p>
                    <a 
                      href="tel:+919944776689" 
                      className="text-2xl font-bold text-green-700 hover:text-green-800 hover:underline transition-colors"
                    >
                      +91 9944776689
                    </a>
                    <p className="text-xs text-gray-600 mt-1">Available on WhatsApp for quick support</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 bg-white p-4 rounded-lg">
                  <Clock className="h-5 w-5 text-purple-600 flex-shrink-0" />
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Availability</p>
                    <p className="text-sm font-medium text-gray-900">Mon-Sat: 9 AM - 7 PM</p>
                    <p className="text-xs text-gray-600">Usually responds within 2-4 hours</p>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* What We Can Help With */}
        <Card className="border-0 shadow-lg">
          <CardHeader>
            <CardTitle className="text-xl text-gray-900">How We Can Help You</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                <h4 className="font-semibold text-green-900 mb-2">💳 Credit & Billing</h4>
                <ul className="text-sm text-green-800 space-y-1">
                  <li>• Credit top-up assistance</li>
                  <li>• Payment confirmation</li>
                  <li>• Billing inquiries</li>
                  <li>• Refund requests</li>
                </ul>
              </div>

              <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                <h4 className="font-semibold text-blue-900 mb-2">🔧 Technical Support</h4>
                <ul className="text-sm text-blue-800 space-y-1">
                  <li>• Calculation queries</li>
                  <li>• System errors</li>
                  <li>• Account issues</li>
                  <li>• Feature requests</li>
                </ul>
              </div>

              <div className="p-4 bg-purple-50 rounded-lg border border-purple-200">
                <h4 className="font-semibold text-purple-900 mb-2">📄 Contract & Bills</h4>
                <ul className="text-sm text-purple-800 space-y-1">
                  <li>• PVC calculation help</li>
                  <li>• GCC compliance questions</li>
                  <li>• Report generation issues</li>
                  <li>• Classification guidance</li>
                </ul>
              </div>

              <div className="p-4 bg-amber-50 rounded-lg border border-amber-200">
                <h4 className="font-semibold text-amber-900 mb-2">👤 Account Management</h4>
                <ul className="text-sm text-amber-800 space-y-1">
                  <li>• Account activation</li>
                  <li>• Password reset</li>
                  <li>• Profile updates</li>
                  <li>• User permissions</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* System Information */}
        <Card className="border-0 shadow-lg">
          <CardHeader>
            <CardTitle className="text-xl text-gray-900">System Information</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-start gap-3">
                <Globe className="h-5 w-5 text-blue-600 mt-1 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-gray-900 mb-1">Website</p>
                  <a 
                    href="https://irpvc.in" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline"
                  >
                    https://irpvc.in
                  </a>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <MapPin className="h-5 w-5 text-blue-600 mt-1 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-gray-900 mb-1">Service Area</p>
                  <p className="text-sm text-gray-600">
                    Indian Railway Contractors<br />
                    (All Zones and Divisions)
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card className="border-0 shadow-lg bg-gradient-to-r from-blue-50 to-purple-50">
          <CardContent className="pt-6">
            <div className="text-center space-y-4">
              <h3 className="text-lg font-semibold text-gray-900">Need Immediate Assistance?</h3>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button asChild size="lg" className="bg-green-600 hover:bg-green-700">
                  <a href="tel:+919944776689">
                    <Phone className="h-5 w-5 mr-2" />
                    Call Now
                  </a>
                </Button>

                <Button asChild size="lg" className="bg-blue-600 hover:bg-blue-700">
                  <a href="mailto:admin@irpvc.in">
                    <Mail className="h-5 w-5 mr-2" />
                    Email Us
                  </a>
                </Button>
                
                <Button asChild size="lg" variant="outline">
                  <Link href="/payment-guide">
                    <MessageCircle className="h-5 w-5 mr-2" />
                    Payment Guide
                  </Link>
                </Button>

                <Button asChild size="lg" variant="outline">
                  <Link href="/profile">
                    <Mail className="h-5 w-5 mr-2" />
                    Billing Info
                  </Link>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Response Time Notice */}
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <Clock className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-amber-900">
                <p className="font-medium mb-1">Response Time</p>
                <p>
                  We typically respond to inquiries within <strong>2-4 hours during business hours</strong>.
                  For urgent billing or technical issues, please call directly for faster assistance.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
