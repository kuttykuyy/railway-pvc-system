'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { 
  Gift, 
  CheckCircle, 
  Zap,
  FileText,
  Phone,
  User,
  CreditCard,
  IndianRupee,
  Loader2
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BackButton } from '@/components/ui/back-button';

interface BillingSettings {
  billCost: number;
  freeTrialBills: number;
  freeTrialUsed: number;
  freeTrialRemaining: number;
  isTrialActive: boolean;
  isFreeAccount: boolean;
  customProcessingFee: number | null;
}

export default function PaymentGuidePage() {
  const router = useRouter();
  const [billingSettings, setBillingSettings] = useState<BillingSettings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const response = await fetch('/api/billing/settings');
        if (response.ok) {
          const data = await response.json();
          setBillingSettings(data);
        }
      } catch (error) {
        console.error('Error fetching billing settings:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchSettings();
  }, []);

  const effectiveBillCost = billingSettings?.isFreeAccount 
    ? 0 
    : billingSettings?.customProcessingFee !== null && billingSettings?.customProcessingFee !== undefined
      ? billingSettings.customProcessingFee
      : billingSettings?.billCost || 199; // Default matches BILL_PROCESSING_COST in admin settings

  const freeTrialText = billingSettings?.freeTrialBills === 1 
    ? 'First 1 bill is free' 
    : `First ${billingSettings?.freeTrialBills || 1} bills are free`;
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-orange-50">
      {/* Header */}
      <div className="bg-white/80 backdrop-blur-sm border-b sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <BackButton href="/" variant="ghost" label="Back" />
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Credit Top-up Guide</h1>
                <p className="text-gray-600">How to add credits for Railway PVC bill processing</p>
              </div>
            </div>
            <Link href="/bills/new">
              <Button className="bg-gradient-to-r from-blue-600 to-orange-600 hover:from-blue-700 hover:to-orange-700">
                <Zap className="h-4 w-4 mr-2" />
                Process Bill
              </Button>
            </Link>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Contact Information */}
        <Card className="mb-8 border-0 shadow-lg bg-gradient-to-r from-blue-50 to-indigo-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-3 text-blue-800 text-xl">
              <Phone className="h-6 w-6" />
              Contact for Credit Top-up
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="bg-white p-6 rounded-lg border border-blue-200">
              <div className="flex items-center gap-4 mb-4">
                <User className="h-6 w-6 text-blue-600" />
                <div>
                  <div className="text-xl font-bold text-gray-900">Prasath Kumar</div>
                  <div className="text-gray-600">System Administrator</div>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <Phone className="h-6 w-6 text-green-600" />
                <a 
                  href="tel:+919944776689" 
                  className="text-xl font-semibold text-green-700 hover:text-green-800 hover:underline transition-colors"
                >
                  +91 9944776689
                </a>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="border-amber-200 bg-amber-50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-amber-800">
                <IndianRupee className="h-5 w-5" />
                Billing Information
              </CardTitle>
              <CardDescription className="text-amber-700">
                Credit system pricing and trial details
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-amber-600" />
                </div>
              ) : (
                <ul className="space-y-2 text-amber-700">
                  {billingSettings?.isFreeAccount ? (
                    <>
                      <li>• <strong>Free Account</strong> - unlimited bills</li>
                      <li>• No processing fees</li>
                    </>
                  ) : (
                    <>
                      <li>• {freeTrialText} (trial)</li>
                      <li>• ₹{effectiveBillCost.toLocaleString()} per bill after trial</li>
                    </>
                  )}
                  <li>• Contact required for top-up</li>
                  <li>• Full PVC calculations included</li>
                  <li>• Detailed PDF reports included</li>
                </ul>
              )}
            </CardContent>
          </Card>

          <Card className="border-blue-200 bg-blue-50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-blue-800">
                <CreditCard className="h-5 w-5" />
                How to Top-up Credits
              </CardTitle>
              <CardDescription className="text-blue-700">
                Simple steps to add credits
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ol className="space-y-2 text-blue-700">
                <li>1. Call +91 9944776689</li>
                <li>2. Speak with Prasath Kumar</li>
                <li>3. Mention your account details</li>
                <li>4. Make payment as instructed</li>
                <li>5. Credits will be added promptly</li>
              </ol>
            </CardContent>
          </Card>
        </div>

        <div className="text-center mt-8 space-y-4">
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a href="tel:+919944776689">
              <Button size="lg" className="bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700">
                <Phone className="h-5 w-5 mr-2" />
                Call for Credit Top-up
              </Button>
            </a>
            <Link href="/bills/new">
              <Button size="lg" variant="outline" className="border-2">
                <FileText className="h-5 w-5 mr-2" />
                Process Bills
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
