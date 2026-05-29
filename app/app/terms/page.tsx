
'use client';

import { BackButton } from '@/components/ui/back-button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FileText } from 'lucide-react';

export default function TermsAndConditionsPage() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <BackButton href="/" className="mb-6" />
      
      <Card className="border-0 shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-3 text-2xl">
            <FileText className="h-7 w-7 text-blue-600" />
            Terms and Conditions
          </CardTitle>
          <p className="text-sm text-gray-600 mt-2">Last Updated: October 26, 2025</p>
        </CardHeader>
        
        <CardContent className="prose prose-sm max-w-none space-y-6">
          <section>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">1. Acceptance of Terms</h3>
            <p className="text-gray-700 leading-relaxed">
              By accessing and using the Indian Railway PVC Bill Management System (irpvc.in), you agree to be bound by these Terms and Conditions. 
              If you do not agree with any part of these terms, you may not use our service.
            </p>
          </section>

          <section>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">2. Service Description</h3>
            <p className="text-gray-700 leading-relaxed mb-2">
              We provide a digital platform for calculating Price Variation Clause (PVC) amounts for Indian Railway contracts. Our services include:
            </p>
            <ul className="list-disc pl-6 space-y-1 text-gray-700">
              <li>Automated PVC calculations based on GCC-2022 guidelines</li>
              <li>Bill generation and management</li>
              <li>PDF report generation with detailed breakdowns</li>
              <li>Contract and classification management</li>
              <li>Index tracking and historical data management</li>
            </ul>
          </section>

          <section>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">3. User Accounts</h3>
            <p className="text-gray-700 leading-relaxed mb-2">
              To use our service, you must:
            </p>
            <ul className="list-disc pl-6 space-y-1 text-gray-700">
              <li>Create an account with accurate and complete information</li>
              <li>Maintain the confidentiality of your account credentials</li>
              <li>Be at least 18 years of age or have proper authorization</li>
              <li>Accept full responsibility for all activities under your account</li>
              <li>Notify us immediately of any unauthorized use</li>
            </ul>
          </section>

          <section>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">4. Credit System and Billing</h3>
            <div className="space-y-3 text-gray-700">
              <p><strong>Free Trial:</strong> New users receive complimentary bills as per their account settings.</p>
              <p><strong>Credit Purchase:</strong> After the trial period, credits must be purchased to process bills. Standard processing fee applies per bill.</p>
              <p><strong>Payment Method:</strong> Credits are added manually after payment confirmation. Contact our administrator for credit top-up.</p>
              <p><strong>Credit Expiry:</strong> Credits do not expire and remain valid until used.</p>
              <p><strong>No Automatic Refills:</strong> We do not automatically charge for credit refills. All top-ups are manual.</p>
            </div>
          </section>

          <section>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">5. Use of Service</h3>
            <p className="text-gray-700 leading-relaxed mb-2">
              You agree to use this service only for lawful purposes and in accordance with these terms. You agree NOT to:
            </p>
            <ul className="list-disc pl-6 space-y-1 text-gray-700">
              <li>Use the service for any illegal or unauthorized purpose</li>
              <li>Attempt to gain unauthorized access to any part of the system</li>
              <li>Upload malicious code or attempt to disrupt the service</li>
              <li>Share your account credentials with unauthorized persons</li>
              <li>Use automated scripts to extract data without permission</li>
              <li>Misrepresent contract or bill information</li>
            </ul>
          </section>

          <section>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">6. Accuracy of Calculations</h3>
            <p className="text-gray-700 leading-relaxed">
              While we strive to provide accurate PVC calculations based on GCC-2022 guidelines and official index data, 
              users are responsible for verifying all calculations and data. Our service is a tool to assist in PVC computation, 
              and users should perform their own due diligence before submitting bills to railway authorities.
            </p>
          </section>

          <section>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">7. Data Privacy and Security</h3>
            <p className="text-gray-700 leading-relaxed">
              We take data security seriously. All contract information, bill data, and user information is stored securely. 
              Please refer to our Privacy Policy for detailed information about how we collect, use, and protect your data.
            </p>
          </section>

          <section>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">8. Intellectual Property</h3>
            <p className="text-gray-700 leading-relaxed">
              All content, features, and functionality of this service, including but not limited to software, text, graphics, 
              logos, and calculations are owned by us and are protected by copyright, trademark, and other intellectual property laws.
            </p>
          </section>

          <section>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">9. Limitation of Liability</h3>
            <p className="text-gray-700 leading-relaxed">
              To the maximum extent permitted by law, we shall not be liable for any indirect, incidental, special, consequential, 
              or punitive damages resulting from your use or inability to use the service, including but not limited to calculation 
              errors, data loss, or financial losses.
            </p>
          </section>

          <section>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">10. Service Modifications</h3>
            <p className="text-gray-700 leading-relaxed">
              We reserve the right to modify, suspend, or discontinue any part of the service at any time with or without notice. 
              We will not be liable to you or any third party for any modification, suspension, or discontinuation of the service.
            </p>
          </section>

          <section>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">11. Termination</h3>
            <p className="text-gray-700 leading-relaxed">
              We reserve the right to terminate or suspend your account immediately, without prior notice, for any violation of these 
              Terms and Conditions. Upon termination, your right to use the service will cease immediately.
            </p>
          </section>

          <section>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">12. Changes to Terms</h3>
            <p className="text-gray-700 leading-relaxed">
              We reserve the right to modify these terms at any time. We will notify users of any changes by posting the new 
              Terms and Conditions on this page with an updated revision date. Your continued use of the service after any changes 
              constitutes acceptance of the new terms.
            </p>
          </section>

          <section>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">13. Governing Law</h3>
            <p className="text-gray-700 leading-relaxed">
              These Terms and Conditions shall be governed by and construed in accordance with the laws of India. Any disputes 
              arising from these terms shall be subject to the exclusive jurisdiction of the courts in Tamil Nadu, India.
            </p>
          </section>

          <section>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">14. Contact Information</h3>
            <p className="text-gray-700 leading-relaxed">
              For questions about these Terms and Conditions, please contact:<br />
              <strong>Prasath Kumar</strong><br />
              Phone: +91 9944776689<br />
              Website: <a href="https://irpvc.in" className="text-blue-600 hover:underline">irpvc.in</a>
            </p>
          </section>

          <section>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">15. Severability</h3>
            <p className="text-gray-700 leading-relaxed">
              If any provision of these Terms and Conditions is found to be unenforceable or invalid, that provision shall be 
              limited or eliminated to the minimum extent necessary, and the remaining provisions shall remain in full force and effect.
            </p>
          </section>
        </CardContent>
      </Card>
    </div>
  );
}
