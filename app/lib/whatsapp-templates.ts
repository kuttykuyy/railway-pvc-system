
/**
 * WhatsApp Message Templates Configuration
 * Templates approved by WhatsApp Business API
 */

export interface WhatsAppTemplate {
  name: string;
  description: string;
  parameters: string[];
  sampleValues: string[];
}

/**
 * Approved WhatsApp message templates
 */
export const WHATSAPP_TEMPLATES: Record<string, WhatsAppTemplate> = {
  user_signup_welcome: {
    name: 'user_signup_welcome',
    description: 'Admin notification when a new user signs up (sent to admin, not user)',
    parameters: [
      'userName',          // {{1}} - User Name
      'email',             // {{2}} - Email Address
      'userWhatsApp',      // {{3}} - User's WhatsApp Number
      'registrationDate',  // {{4}} - Registration Date & Time
    ],
    sampleValues: [
      'Rajesh Kumar',
      'rajesh@example.com',
      '+919876543210',
      '18-Nov-2025 at 02:30 PM',
    ],
  },
  
  welcome_new_user: {
    name: 'welcome_new_user',
    description: 'Welcome message sent to new user after signup with support contact number',
    parameters: [
      'userName',          // {{1}} - User Name
      'supportNumber',     // {{2}} - Support WhatsApp Number
    ],
    sampleValues: [
      'Rajesh Kumar',
      '+919944776689',
    ],
  },
  
  bill_created_with_pdf: {
    name: 'bill_created_with_pdf',
    description: 'Notification when a new bill is created (sent to contractor and admin)',
    parameters: [
      'customerName',      // {{1}} - Name
      'billNumber',        // {{2}} - Bill Number
      'agreementNo',       // {{3}} - Contract Agreement No
      'measurementPeriod', // {{4}} - Measurement Period Ending
      'billAmount',        // {{5}} - Bill Amount
    ],
    sampleValues: [
      'John Doe',
      'B123',
      'AGR/2024/001',
      '31-Oct-2024',
      '₹5,00,000',
    ],
  },
  
  gst_invoice_notification: {
    name: 'gst_invoice_notification',
    description: 'Notification when GST invoice is generated',
    parameters: [
      'customerName',      // {{1}} - Name
      'invoiceNumber',     // {{2}} - Invoice Number
      'invoiceDate',       // {{3}} - Invoice Date
      'subtotal',          // {{4}} - Subtotal (Taxable Amount)
      'cgst',              // {{5}} - CGST @ 9%
      'sgst',              // {{6}} - SGST @ 9%
      'totalAmount',       // {{7}} - Total Invoice Amount
    ],
    sampleValues: [
      'John Doe',
      'GST-1234567890',
      '14-Nov-2025',
      '₹10,000',
      '₹900',
      '₹900',
      '₹11,800',
    ],
  },
  
  payment_confirmation: {
    name: 'payment_confirmation',
    description: 'Confirmation message after successful payment',
    parameters: [
      'customerName',      // {{1}} - Name
      'transactionId',     // {{2}} - Transaction ID
      'creditsAdded',      // {{3}} - Credits Added
      'gstAmount',         // {{4}} - GST (18%)
      'totalAmount',       // {{5}} - Total Amount Paid
      'newBalance',        // {{6}} - New Credit Balance
      'paymentDateTime',   // {{7}} - Payment Date & Time
    ],
    sampleValues: [
      'John Doe',
      'TXN123456789',
      '₹5,000',
      '₹900',
      '₹5,900',
      '₹15,000',
      '13-Nov-2025 at 03:41 PM',
    ],
  },
};

/**
 * Get template configuration by name
 */
export function getTemplate(templateName: string): WhatsAppTemplate | null {
  return WHATSAPP_TEMPLATES[templateName] || null;
}

/**
 * Format template parameters for WhatsApp API
 * @param templateName - Name of the template
 * @param values - Object with parameter values
 * @returns Array of parameter values in correct order
 */
export function formatTemplateParams(
  templateName: string,
  values: Record<string, string>
): string[] {
  const template = getTemplate(templateName);
  if (!template) {
    throw new Error(`Template '${templateName}' not found`);
  }

  return template.parameters.map((param) => values[param] || '');
}

/**
 * Validate template parameters
 */
export function validateTemplateParams(
  templateName: string,
  values: Record<string, string>
): { valid: boolean; missingParams: string[] } {
  const template = getTemplate(templateName);
  if (!template) {
    return { valid: false, missingParams: [] };
  }

  const missingParams = template.parameters.filter((param) => !values[param]);
  
  return {
    valid: missingParams.length === 0,
    missingParams,
  };
}
