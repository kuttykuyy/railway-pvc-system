
'use client';

import { BackButton } from '@/components/ui/back-button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Shield } from 'lucide-react';

export default function PrivacyPolicyPage() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <BackButton href="/dashboard" className="mb-6" />
      
      <Card className="border-0 shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-3 text-2xl">
            <Shield className="h-7 w-7 text-blue-600" />
            Privacy Policy
          </CardTitle>
          <p className="text-sm text-gray-600 mt-2">Last Updated: October 26, 2025</p>
        </CardHeader>
        
        <CardContent className="prose prose-sm max-w-none space-y-6">
          <section>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">1. Introduction</h3>
            <p className="text-gray-700 leading-relaxed">
              This Privacy Policy describes how Indian Railway PVC Bill Management System ("we", "us", or "our") collects, 
              uses, and protects your personal information when you use our service at irpvc.in. We are committed to ensuring 
              that your privacy is protected.
            </p>
          </section>

          <section>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">2. Information We Collect</h3>
            <div className="space-y-3">
              <div>
                <h4 className="font-medium text-gray-900 mb-2">2.1 Personal Information</h4>
                <ul className="list-disc pl-6 space-y-1 text-gray-700">
                  <li>Full name and contact details</li>
                  <li>Email address and phone number</li>
                  <li>Organization/company name</li>
                  <li>Account credentials (encrypted password)</li>
                  <li>Payment and billing information</li>
                </ul>
              </div>

              <div>
                <h4 className="font-medium text-gray-900 mb-2">2.2 Contract and Bill Data</h4>
                <ul className="list-disc pl-6 space-y-1 text-gray-700">
                  <li>Contract details (agreement numbers, dates, values)</li>
                  <li>Work descriptions and classifications</li>
                  <li>Bill information and calculations</li>
                  <li>PVC calculation data and breakdowns</li>
                  <li>Uploaded documents and reports</li>
                </ul>
              </div>

              <div>
                <h4 className="font-medium text-gray-900 mb-2">2.3 Usage Information</h4>
                <ul className="list-disc pl-6 space-y-1 text-gray-700">
                  <li>Login dates and times</li>
                  <li>IP addresses and device information</li>
                  <li>Browser type and version</li>
                  <li>Pages visited and features used</li>
                  <li>Actions performed within the system</li>
                </ul>
              </div>
            </div>
          </section>

          <section>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">3. How We Use Your Information</h3>
            <p className="text-gray-700 leading-relaxed mb-2">We use the collected information for the following purposes:</p>
            <ul className="list-disc pl-6 space-y-1 text-gray-700">
              <li>To provide and maintain our PVC calculation service</li>
              <li>To process bills and generate reports</li>
              <li>To manage your account and provide customer support</li>
              <li>To process payments and manage billing</li>
              <li>To improve our service and develop new features</li>
              <li>To comply with legal and regulatory requirements</li>
              <li>To detect and prevent fraud or unauthorized access</li>
              <li>To send important notifications about your account or service updates</li>
            </ul>
          </section>

          <section>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">4. Data Storage and Security</h3>
            <div className="space-y-3 text-gray-700">
              <p><strong>Secure Storage:</strong> All data is stored in secure databases with encryption at rest and in transit using industry-standard protocols.</p>
              <p><strong>Access Control:</strong> Access to user data is strictly limited to authorized personnel only.</p>
              <p><strong>Password Protection:</strong> User passwords are hashed using bcrypt encryption and cannot be retrieved in plain text.</p>
              <p><strong>Regular Backups:</strong> We maintain regular backups to prevent data loss.</p>
              <p><strong>Security Monitoring:</strong> We continuously monitor our systems for potential security vulnerabilities.</p>
            </div>
          </section>

          <section>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">5. Data Sharing and Disclosure</h3>
            <p className="text-gray-700 leading-relaxed mb-2">
              We do not sell, trade, or rent your personal information to third parties. We may share information only in the following circumstances:
            </p>
            <ul className="list-disc pl-6 space-y-1 text-gray-700">
              <li><strong>Service Providers:</strong> With trusted third-party service providers who assist in operating our platform (e.g., hosting, payment processing)</li>
              <li><strong>Legal Requirements:</strong> When required by law, court order, or government regulation</li>
              <li><strong>Protection of Rights:</strong> To protect our rights, property, or safety, or that of our users</li>
              <li><strong>Business Transfer:</strong> In the event of a merger, acquisition, or sale of assets</li>
            </ul>
          </section>

          <section>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">6. Your Data Rights</h3>
            <p className="text-gray-700 leading-relaxed mb-2">You have the following rights regarding your personal data:</p>
            <ul className="list-disc pl-6 space-y-1 text-gray-700">
              <li><strong>Access:</strong> Request a copy of your personal data we hold</li>
              <li><strong>Correction:</strong> Request correction of inaccurate or incomplete data</li>
              <li><strong>Deletion:</strong> Request deletion of your personal data (subject to legal obligations)</li>
              <li><strong>Portability:</strong> Request transfer of your data to another service</li>
              <li><strong>Objection:</strong> Object to certain types of data processing</li>
              <li><strong>Withdrawal:</strong> Withdraw consent for data processing at any time</li>
            </ul>
            <p className="text-gray-700 leading-relaxed mt-3">
              To exercise any of these rights, please contact us using the information provided in Section 11.
            </p>
          </section>

          <section>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">7. Cookies and Tracking</h3>
            <p className="text-gray-700 leading-relaxed">
              We use essential cookies to maintain your login session and provide core functionality. We do not use third-party 
              advertising cookies or tracking cookies. You can control cookie preferences through your browser settings.
            </p>
          </section>

          <section>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">8. Data Retention</h3>
            <p className="text-gray-700 leading-relaxed">
              We retain your personal information for as long as your account is active or as needed to provide services. 
              Contract and bill data may be retained for longer periods to comply with legal and accounting requirements. 
              When data is no longer needed, it will be securely deleted or anonymized.
            </p>
          </section>

          <section>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">9. Third-Party Links</h3>
            <p className="text-gray-700 leading-relaxed">
              Our service may contain links to external websites (e.g., official Indian Railway sites for index data). 
              We are not responsible for the privacy practices of these external sites. We encourage you to read their 
              privacy policies before providing any information.
            </p>
          </section>

          <section>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">10. Children's Privacy</h3>
            <p className="text-gray-700 leading-relaxed">
              Our service is not intended for users under the age of 18. We do not knowingly collect personal information 
              from children. If you believe we have collected information from a child, please contact us immediately.
            </p>
          </section>

          <section>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">11. Contact Information</h3>
            <p className="text-gray-700 leading-relaxed">
              For any questions about this Privacy Policy or to exercise your data rights, please contact:<br />
              <strong>Prasath Kumar</strong><br />
              Phone: +91 9944776689<br />
              Website: <a href="https://irpvc.in" className="text-blue-600 hover:underline">irpvc.in</a>
            </p>
          </section>

          <section>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">12. Changes to Privacy Policy</h3>
            <p className="text-gray-700 leading-relaxed">
              We may update this Privacy Policy from time to time. We will notify you of any significant changes by posting 
              the new Privacy Policy on this page with an updated date. We encourage you to review this policy periodically.
            </p>
          </section>

          <section>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">13. Compliance</h3>
            <p className="text-gray-700 leading-relaxed">
              This Privacy Policy is designed to comply with the Information Technology Act, 2000, and other applicable 
              Indian data protection laws and regulations.
            </p>
          </section>
        </CardContent>
      </Card>
    </div>
  );
}
