
'use client';

import { BackButton } from '@/components/ui/back-button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RefreshCw } from 'lucide-react';

export default function RefundPolicyPage() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <BackButton href="/" className="mb-6" />
      
      <Card className="border-0 shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-3 text-2xl">
            <RefreshCw className="h-7 w-7 text-blue-600" />
            Cancellation and Refund Policy
          </CardTitle>
          <p className="text-sm text-gray-600 mt-2">Last Updated: October 26, 2025</p>
        </CardHeader>
        
        <CardContent className="prose prose-sm max-w-none space-y-6">
          <section>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">1. Service Nature</h3>
            <p className="text-gray-700 leading-relaxed">
              Indian Railway PVC Bill Management System provides digital bill processing services on a credit-based system. 
              Once a bill is processed and the PDF report is generated, the service is considered delivered and credits are deducted 
              from your account. Please review this policy carefully before making any payment.
            </p>
          </section>

          <section>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">2. No Cancellation After Processing</h3>
            <p className="text-gray-700 leading-relaxed mb-2">
              Due to the instant and automated nature of our service:
            </p>
            <ul className="list-disc pl-6 space-y-1 text-gray-700">
              <li>Once a bill is submitted for processing, the calculation begins immediately</li>
              <li>Credits are deducted automatically upon successful bill processing</li>
              <li>Processed bills cannot be cancelled or reversed</li>
              <li>You can, however, delete or modify bills before final submission</li>
            </ul>
          </section>

          <section>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">3. Credit Purchase and Top-up</h3>
            <div className="space-y-3 text-gray-700">
              <p><strong>Credit Addition:</strong> Credits are added to your account manually after payment confirmation by our administrator.</p>
              <p><strong>Payment Methods:</strong> We accept bank transfers, UPI, and other digital payment methods as communicated by our administrator.</p>
              <p><strong>Processing Time:</strong> Credits are typically added within 24 hours of payment confirmation (usually much faster).</p>
              <p><strong>Credit Validity:</strong> Credits do not expire and remain in your account until used.</p>
            </div>
          </section>

          <section>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">4. Refund Eligibility</h3>
            <p className="text-gray-700 leading-relaxed mb-2">
              Refunds may be considered in the following limited circumstances:
            </p>
            
            <div className="space-y-4">
              <div>
                <h4 className="font-medium text-gray-900 mb-2">4.1 Technical Errors</h4>
                <ul className="list-disc pl-6 space-y-1 text-gray-700">
                  <li>System malfunction causing incorrect calculations</li>
                  <li>Credits deducted but bill not processed successfully</li>
                  <li>Duplicate charges due to technical glitches</li>
                  <li>Service unavailability after credit deduction</li>
                </ul>
              </div>

              <div>
                <h4 className="font-medium text-gray-900 mb-2">4.2 Payment Errors</h4>
                <ul className="list-disc pl-6 space-y-1 text-gray-700">
                  <li>Duplicate payment for the same credit top-up</li>
                  <li>Incorrect amount charged or credited</li>
                  <li>Payment made but credits not added within 48 hours</li>
                </ul>
              </div>

              <div>
                <h4 className="font-medium text-gray-900 mb-2">4.3 Account Closure</h4>
                <p className="text-gray-700">
                  If you decide to close your account and have unused credits, you may request a refund of the remaining credit balance, 
                  subject to a minimum threshold and processing fee.
                </p>
              </div>
            </div>
          </section>

          <section>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">5. Non-Refundable Scenarios</h3>
            <p className="text-gray-700 leading-relaxed mb-2">
              Refunds will NOT be provided in the following cases:
            </p>
            <ul className="list-disc pl-6 space-y-1 text-gray-700">
              <li>Bills that have been successfully processed (credits deducted and PDF generated)</li>
              <li>User errors in entering bill or contract information</li>
              <li>Dissatisfaction with calculation results (when calculations are accurate per GCC guidelines)</li>
              <li>Change of mind after processing bills</li>
              <li>Unused credits in an active account (credits don't expire)</li>
              <li>Free trial bills already used</li>
            </ul>
          </section>

          <section>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">6. Refund Request Process</h3>
            <p className="text-gray-700 leading-relaxed mb-2">
              If you believe you are eligible for a refund, please follow these steps:
            </p>
            <ol className="list-decimal pl-6 space-y-2 text-gray-700">
              <li>Contact our administrator within 7 days of the transaction</li>
              <li>Provide your account details and transaction reference</li>
              <li>Explain the reason for the refund request with supporting evidence</li>
              <li>Our team will review your request within 5-7 business days</li>
              <li>If approved, the refund will be processed within 10-14 business days</li>
            </ol>
          </section>

          <section>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">7. Refund Methods</h3>
            <p className="text-gray-700 leading-relaxed">
              Approved refunds will be processed using the same payment method used for the original transaction. 
              If the original payment method is no longer available, we will arrange an alternative method such as 
              bank transfer to your registered account.
            </p>
          </section>

          <section>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">8. Credit Adjustments</h3>
            <p className="text-gray-700 leading-relaxed">
              In cases where a refund is not applicable but an error occurred, we may offer:
            </p>
            <ul className="list-disc pl-6 space-y-1 text-gray-700">
              <li>Credit adjustment to your account</li>
              <li>Complimentary bill processing</li>
              <li>Waiver of processing fees for affected bills</li>
            </ul>
          </section>

          <section>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">9. Billing Disputes</h3>
            <p className="text-gray-700 leading-relaxed">
              If you notice any discrepancies in your credit balance or billing:
            </p>
            <ul className="list-disc pl-6 space-y-1 text-gray-700">
              <li>Review your transaction history in the Billing section</li>
              <li>Contact our administrator immediately with specific details</li>
              <li>We will investigate and respond within 48 hours</li>
              <li>Any genuine errors will be corrected promptly</li>
            </ul>
          </section>

          <section>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">10. Free Trial Policy</h3>
            <p className="text-gray-700 leading-relaxed">
              New users receive complimentary bills (as per account settings) for trial purposes. These free bills:
            </p>
            <ul className="list-disc pl-6 space-y-1 text-gray-700">
              <li>Are provided one-time per account</li>
              <li>Cannot be refunded or exchanged for cash</li>
              <li>Expire if not used (though no time limit is enforced)</li>
              <li>Are non-transferable to other accounts</li>
            </ul>
          </section>

          <section>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">11. Service Modifications</h3>
            <p className="text-gray-700 leading-relaxed">
              If we make significant changes to our pricing or service terms:
            </p>
            <ul className="list-disc pl-6 space-y-1 text-gray-700">
              <li>Existing credit balances will be honored at the original purchase rate</li>
              <li>We will notify users of pricing changes in advance</li>
              <li>Users may request a refund of unused credits if pricing increases significantly</li>
            </ul>
          </section>

          <section>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">12. Contact for Refunds</h3>
            <p className="text-gray-700 leading-relaxed">
              For refund requests or billing inquiries, please contact:<br />
              <strong>Prasath Kumar</strong><br />
              Phone: +91 9944776689<br />
              Website: <a href="https://irpvc.in" className="text-blue-600 hover:underline">irpvc.in</a>
            </p>
            <p className="text-gray-700 leading-relaxed mt-3">
              <em>Note: Response time is typically within 24-48 hours during business days.</em>
            </p>
          </section>

          <section>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">13. Policy Updates</h3>
            <p className="text-gray-700 leading-relaxed">
              We reserve the right to modify this refund policy at any time. Changes will be posted on this page with an 
              updated date. Your continued use of the service after changes constitutes acceptance of the modified policy.
            </p>
          </section>

          <section>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">14. Legal Disclaimer</h3>
            <p className="text-gray-700 leading-relaxed">
              This refund policy is subject to applicable Indian laws and regulations. In case of disputes, the matter shall 
              be subject to the exclusive jurisdiction of courts in Tamil Nadu, India.
            </p>
          </section>
        </CardContent>
      </Card>
    </div>
  );
}
