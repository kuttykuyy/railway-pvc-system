import { logger } from './logger';

/**
 * MyDreams Technology WhatsApp API Integration
 * For sending bill PDFs via WhatsApp Business API
 */

import { prisma } from './db';
import { formatTemplateParams, validateTemplateParams, getTemplate } from './whatsapp-templates';
import { format } from 'date-fns';
import jwt from 'jsonwebtoken';

interface MyDreamsCredentials {
  licenseNumber: string;
  apiKey: string;
}

interface SendBillPDFParams {
  contact: string;
  template: string;
  params?: string[];
  fileUrl: string;
  customerName: string;
  pdfName: string;
}

/**
 * Get MyDreams WhatsApp credentials from admin settings
 */
async function getMyDreamsCredentials(): Promise<MyDreamsCredentials | null> {
  try {
    const [licenseNumberSetting, apiKeySetting] = await Promise.all([
      prisma.adminSettings.findUnique({
        where: { key: 'mydreams_license_number' },
      }),
      prisma.adminSettings.findUnique({
        where: { key: 'mydreams_api_key' },
      }),
    ]);

    if (!licenseNumberSetting?.value || !apiKeySetting?.value) {
      console.error('MyDreams WhatsApp credentials not configured');
      return null;
    }

    return {
      licenseNumber: licenseNumberSetting.value,
      apiKey: apiKeySetting.value,
    };
  } catch (error) {
    console.error('Error loading MyDreams credentials:', error);
    return null;
  }
}

/**
 * Get admin WhatsApp number from settings
 */
export async function getAdminWhatsAppNumber(): Promise<string | null> {
  try {
    const setting = await prisma.adminSettings.findUnique({
      where: { key: 'admin_whatsapp_number' },
    });

    if (!setting?.value) {
      console.error('Admin WhatsApp number not configured in settings');
      return null;
    }

    return setting.value;
  } catch (error) {
    console.error('Error loading admin WhatsApp number:', error);
    return null;
  }
}

/**
 * Format phone number for WhatsApp (91XXXXXXXXXX format)
 */
function formatPhoneNumber(phone: string): string {
  // Remove all non-numeric characters
  let cleaned = phone.replace(/\D/g, '');
  
  // Remove leading + if present
  if (cleaned.startsWith('+')) {
    cleaned = cleaned.substring(1);
  }
  
  // Add 91 prefix if not present
  if (!cleaned.startsWith('91')) {
    // If it's a 10-digit number, add 91 prefix
    if (cleaned.length === 10) {
      cleaned = '91' + cleaned;
    }
  }
  
  return cleaned;
}

/**
 * Send bill PDF via WhatsApp using MyDreams API
 */
export async function sendBillPDFWhatsApp(
  params: SendBillPDFParams
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const credentials = await getMyDreamsCredentials();
    if (!credentials) {
      return {
        success: false,
        error: 'MyDreams WhatsApp API not configured',
      };
    }

    const formattedContact = formatPhoneNumber(params.contact);

    // Build the API URL
    const url = new URL('https://wa.mydreamstechnology.in/api/sendtemplate.php');
    url.searchParams.append('LicenseNumber', credentials.licenseNumber);
    url.searchParams.append('APIKey', credentials.apiKey);
    url.searchParams.append('Contact', formattedContact);
    url.searchParams.append('Template', params.template);
    
    if (params.params && params.params.length > 0) {
      url.searchParams.append('Param', params.params.join(','));
    }
    
    url.searchParams.append('Fileurl', params.fileUrl);
    // Removed Name and PDFName parameters - they were being counted as additional template params
    // causing "7 parameters sent vs 5 expected" error

    logger.log('Sending WhatsApp message via MyDreams API');
    logger.log('- Contact:', formattedContact);
    logger.log('- Template:', params.template);
    logger.log('- Params:', params.params);
    logger.log('- Params Count:', params.params?.length || 0);
    logger.log('- File URL:', params.fileUrl);
    logger.log('API URL:', url.toString().replace(credentials.apiKey, '***HIDDEN***'));

    // Send the request
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    const responseText = await response.text();
    logger.log('=== MyDreams API Response ===');
    logger.log('Status:', response.status, response.statusText);
    logger.log('Headers:', Object.fromEntries(response.headers.entries()));
    logger.log('Body:', responseText);
    logger.log('===========================');

    if (!response.ok) {
      console.error('MyDreams API Error Response:', {
        status: response.status,
        statusText: response.statusText,
        body: responseText,
      });
      return {
        success: false,
        error: `Failed to send message: ${response.statusText} - ${responseText}`,
      };
    }

    // Try to parse JSON response
    let data: any = {};
    try {
      data = JSON.parse(responseText);
      logger.log('Parsed Response Data:', data);
    } catch (e) {
      // Response might not be JSON
      logger.log('Response is not JSON format, treating as success');
      logger.log('Raw response:', responseText);
    }

    // Check for error in response data
    if (data.error || data.status === 'error' || data.success === false) {
      console.error('MyDreams API returned error in response:', data);
      return {
        success: false,
        error: data.error || data.message || 'Unknown error from MyDreams API',
      };
    }

    return {
      success: true,
      messageId: data.messageId || data.id || data.message_id || 'sent',
    };
  } catch (error: any) {
    console.error('Error sending WhatsApp message via MyDreams:', error);
    return {
      success: false,
      error: error.message || 'Unknown error',
    };
  }
}

/**
 * Check if MyDreams WhatsApp API is configured
 */
export async function isMyDreamsWhatsAppConfigured(): Promise<boolean> {
  const credentials = await getMyDreamsCredentials();
  return credentials !== null;
}

/**
 * Validate phone number format
 */
export function validatePhoneNumber(phone: string): boolean {
  // Should contain 10-12 digits
  const phoneRegex = /^\+?[1-9]\d{9,11}$/;
  return phoneRegex.test(phone.replace(/\D/g, ''));
}

/**
 * Format bill data for WhatsApp template
 */
interface BillTemplateData {
  customerName: string;
  billNumber: string;
  agreementNo: string;
  measurementPeriod: string;
  billAmount: string;
}

/**
 * Format bill data into template parameters
 */
function formatBillTemplateParams(data: BillTemplateData): string[] {
  return [
    data.customerName,
    data.billNumber,
    data.agreementNo,
    data.measurementPeriod,
    data.billAmount,
  ];
}

/**
 * Send bill PDF notification using 'bill_created_with_pdf' template
 * Template format:
 * - {{1}} = Customer Name
 * - {{2}} = Bill Number
 * - {{3}} = Agreement No
 * - {{4}} = Measurement Period
 * - {{5}} = Bill Amount
 */
export async function sendBillPDFNotification(
  phoneNumber: string,
  billNumber: string,
  pdfUrl: string,
  customerName: string,
  pdfFileName: string,
  templateName?: string,
  templateParams?: string[]
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  
  // Use the approved 'bill_created_with_pdf' template
  const template = templateName || 'bill_created_with_pdf';
  
  // Template params should include all 5 parameters
  const params = templateParams || [customerName];

  logger.log(`[WhatsApp] Sending notification with template: ${template}`);
  logger.log(`[WhatsApp] Parameters:`, params);

  return sendBillPDFWhatsApp({
    contact: phoneNumber,
    template: template,
    params: params,
    fileUrl: pdfUrl,
    customerName: customerName,
    pdfName: pdfFileName,
  });
}

/**
 * Send bill PDF with complete template data
 * Fetches bill details from database and formats all template parameters
 */
export async function sendBillPDFWithTemplate(
  billId: string,
  phoneNumber: string,
  customerName: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    // Fetch bill details
    const bill = await prisma.bill.findUnique({
      where: { id: billId },
      include: {
        contract: true,
      },
    });

    if (!bill) {
      return {
        success: false,
        error: 'Bill not found',
      };
    }

    // Format bill data for template
    const billData: BillTemplateData = {
      customerName: customerName || bill.contract?.contractorName || 'Customer',
      billNumber: bill.billNo || 'N/A',
      agreementNo: bill.contract?.agreementNo || 'N/A',
      measurementPeriod: bill.dateOfMeasurement 
        ? format(new Date(bill.dateOfMeasurement), 'dd-MMM-yyyy')
        : 'N/A',
      // IMPORTANT: Do NOT use toLocaleString() - commas will break parameter parsing!
      billAmount: bill.grossBillAmount 
        ? `₹${bill.grossBillAmount.toFixed(2)}`
        : 'N/A',
    };

    // Format parameters for template
    const templateParams = formatBillTemplateParams(billData);

    // Generate PDF URL via proxy endpoint with JWT token for public access
    const pdfFileName = `PVC_Report_${billData.billNumber.replace(/\//g, '_')}.pdf`;
    const JWT_SECRET = process.env.NEXTAUTH_SECRET || 'fallback-secret-key';
    const pdfToken = jwt.sign({ billId }, JWT_SECRET, { expiresIn: '24h' });
    const encodedToken = encodeURIComponent(pdfToken);
    const pdfUrl = `${process.env.NEXTAUTH_URL}/api/public/bill-pdf?billId=${billId}&token=${encodedToken}`;

    logger.log('[WhatsApp] Sending bill with complete template data:');
    logger.log('- Bill ID:', billId);
    logger.log('- Bill Number:', billData.billNumber);
    logger.log('- Agreement No:', billData.agreementNo);
    logger.log('- Measurement Period:', billData.measurementPeriod);
    logger.log('- Bill Amount:', billData.billAmount);
    logger.log('- Phone Number:', phoneNumber);

    return sendBillPDFNotification(
      phoneNumber,
      billData.billNumber,
      pdfUrl,
      billData.customerName,
      pdfFileName,
      'bill_created_with_pdf',
      templateParams // All 5 parameters
    );
  } catch (error: any) {
    console.error('[WhatsApp] Error sending bill with template:', error);
    return {
      success: false,
      error: error.message || 'Failed to send bill notification',
    };
  }
}

/**
 * Send user signup welcome via WhatsApp using 'user_signup_welcome' template
 * Template format:
 * - {{1}} = User Name
 * - {{2}} = Email Address
 * - {{3}} = Company Name
 * - {{4}} = Registration Date & Time
 */
export async function sendUserSignupWelcome(
  phoneNumber: string,
  userName: string,
  email: string,
  companyName: string,
  registrationDateTime: Date
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    // Convert UTC to IST (UTC+5:30)
    const istOffset = 5.5 * 60 * 60 * 1000; // 5 hours 30 minutes in milliseconds
    const istTime = new Date(registrationDateTime.getTime() + istOffset);
    
    // Format all parameters according to the template
    const templateParams = [
      userName,                                                        // {{1}} - User Name
      email,                                                          // {{2}} - Email Address
      companyName || 'N/A',                                          // {{3}} - Company Name
      format(istTime, 'dd-MMM-yyyy \'at\' hh:mm a'),                // {{4}} - Registration Date & Time (IST)
    ];

    logger.log('[WhatsApp] Sending user signup welcome with template: user_signup_welcome');
    logger.log('[WhatsApp] Parameters:', templateParams);

    // Send via WhatsApp (no file attachment for signup welcome)
    const credentials = await getMyDreamsCredentials();
    if (!credentials) {
      return {
        success: false,
        error: 'MyDreams WhatsApp API not configured',
      };
    }

    const formattedContact = formatPhoneNumber(phoneNumber);

    // Build the API URL (without file attachment)
    const url = new URL('https://wa.mydreamstechnology.in/api/sendtemplate.php');
    url.searchParams.append('LicenseNumber', credentials.licenseNumber);
    url.searchParams.append('APIKey', credentials.apiKey);
    url.searchParams.append('Contact', formattedContact);
    url.searchParams.append('Template', 'user_signup_welcome');
    url.searchParams.append('Param', templateParams.join(','));

    logger.log('[WhatsApp] User signup welcome API URL prepared');
    logger.log('- Contact:', formattedContact);
    logger.log('- Template: user_signup_welcome');
    logger.log('- Params Count:', templateParams.length);

    // Send the request
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    const responseText = await response.text();
    logger.log('=== MyDreams User Signup Welcome Response ===');
    logger.log('Status:', response.status, response.statusText);
    logger.log('Body:', responseText);
    logger.log('==========================================');

    if (!response.ok) {
      console.error('[WhatsApp] User signup welcome API error:', {
        status: response.status,
        statusText: response.statusText,
        body: responseText,
      });
      return {
        success: false,
        error: `Failed to send signup welcome: ${response.statusText}`,
      };
    }

    // Try to parse JSON response
    let data: any = {};
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      // Response might not be JSON
      logger.log('[WhatsApp] Response is not JSON, treating as success');
    }

    // Check for error in response data
    if (data.error || data.status === 'error' || data.success === false) {
      console.error('[WhatsApp] User signup welcome returned error:', data);
      return {
        success: false,
        error: data.error || data.message || 'Unknown error from MyDreams API',
      };
    }

    logger.log('[WhatsApp] ✅ User signup welcome sent successfully');
    return {
      success: true,
      messageId: data.messageId || data.id || data.message_id || 'sent',
    };
  } catch (error: any) {
    console.error('[WhatsApp] Error sending user signup welcome:', error);
    return {
      success: false,
      error: error.message || 'Failed to send signup welcome',
    };
  }
}

/**
 * Send payment confirmation via WhatsApp using 'payment_confirmation' template
 * Template format:
 * - {{1}} = Customer Name
 * - {{2}} = Transaction ID
 * - {{3}} = Credits Added
 * - {{4}} = GST (18%)
 * - {{5}} = Total Amount Paid
 * - {{6}} = New Credit Balance
 * - {{7}} = Payment Date & Time
 */
export async function sendPaymentConfirmation(
  phoneNumber: string,
  customerName: string,
  transactionId: string,
  creditsAdded: number,
  gstAmount: number,
  totalAmount: number,
  newBalance: number,
  paymentDateTime: Date
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    // Convert UTC to IST (UTC+5:30)
    const istOffset = 5.5 * 60 * 60 * 1000; // 5 hours 30 minutes in milliseconds
    const istTime = new Date(paymentDateTime.getTime() + istOffset);
    
    // Format all parameters according to the template
    const templateParams = [
      customerName,                                                    // {{1}} - Customer Name
      transactionId,                                                   // {{2}} - Transaction ID
      `Rs. ${creditsAdded.toFixed(2)}`,                               // {{3}} - Credits Added
      `Rs. ${gstAmount.toFixed(2)}`,                                  // {{4}} - GST (18%)
      `Rs. ${totalAmount.toFixed(2)}`,                                // {{5}} - Total Amount Paid
      `Rs. ${newBalance.toFixed(2)}`,                                 // {{6}} - New Credit Balance
      format(istTime, 'dd-MMM-yyyy \'at\' hh:mm a'),                 // {{7}} - Payment Date & Time (IST)
    ];

    logger.log('[WhatsApp] Sending payment confirmation with template: payment_confirmation');
    logger.log('[WhatsApp] Parameters:', templateParams);

    // Send via WhatsApp (no file attachment for payment confirmation)
    const credentials = await getMyDreamsCredentials();
    if (!credentials) {
      return {
        success: false,
        error: 'MyDreams WhatsApp API not configured',
      };
    }

    const formattedContact = formatPhoneNumber(phoneNumber);

    // Build the API URL (without file attachment)
    const url = new URL('https://wa.mydreamstechnology.in/api/sendtemplate.php');
    url.searchParams.append('LicenseNumber', credentials.licenseNumber);
    url.searchParams.append('APIKey', credentials.apiKey);
    url.searchParams.append('Contact', formattedContact);
    url.searchParams.append('Template', 'payment_confirmation');
    url.searchParams.append('Param', templateParams.join(','));

    logger.log('[WhatsApp] Payment confirmation API URL prepared');
    logger.log('- Contact:', formattedContact);
    logger.log('- Template: payment_confirmation');
    logger.log('- Params Count:', templateParams.length);

    // Send the request
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    const responseText = await response.text();
    logger.log('=== MyDreams Payment Confirmation Response ===');
    logger.log('Status:', response.status, response.statusText);
    logger.log('Body:', responseText);
    logger.log('==========================================');

    if (!response.ok) {
      console.error('[WhatsApp] Payment confirmation API error:', {
        status: response.status,
        statusText: response.statusText,
        body: responseText,
      });
      return {
        success: false,
        error: `Failed to send payment confirmation: ${response.statusText}`,
      };
    }

    // Try to parse JSON response
    let data: any = {};
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      // Response might not be JSON
      logger.log('[WhatsApp] Response is not JSON, treating as success');
    }

    // Check for error in response data
    if (data.error || data.status === 'error' || data.success === false) {
      console.error('[WhatsApp] Payment confirmation returned error:', data);
      return {
        success: false,
        error: data.error || data.message || 'Unknown error from MyDreams API',
      };
    }

    logger.log('[WhatsApp] ✅ Payment confirmation sent successfully');
    return {
      success: true,
      messageId: data.messageId || data.id || data.message_id || 'sent',
    };
  } catch (error: any) {
    console.error('[WhatsApp] Error sending payment confirmation:', error);
    return {
      success: false,
      error: error.message || 'Failed to send payment confirmation',
    };
  }
}

/**
 * Send OTP via WhatsApp for phone verification during signup
 * Uses otp_verification template with 1 parameter: the OTP code
 */
export async function sendOtpWhatsApp(
  phoneNumber: string,
  otpCode: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const credentials = await getMyDreamsCredentials();
    if (!credentials) {
      return { success: false, error: 'WhatsApp API not configured' };
    }

    const formattedContact = formatPhoneNumber(phoneNumber);

    const url = new URL('https://wa.mydreamstechnology.in/api/sendtemplate.php');
    url.searchParams.append('LicenseNumber', credentials.licenseNumber);
    url.searchParams.append('APIKey', credentials.apiKey);
    url.searchParams.append('Contact', formattedContact);
    url.searchParams.append('Template', 'otp_verification');
    url.searchParams.append('Param', otpCode);

    logger.log('[WhatsApp OTP] Sending OTP to:', formattedContact);

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });

    const data = await response.json();
    logger.log('[WhatsApp OTP] API response:', data);

    const isSuccess =
      data.status === 'success' ||
      data.ApiResponse === 'Success' ||
      data.ApiMessage?.Status === 'Success';

    if (!isSuccess) {
      const errorMsg = data.error || data.message || data.ApiMessage?.ErrorMessage?.error?.message || 'Failed to send OTP';
      console.error('[WhatsApp OTP] Error:', errorMsg);
      return { success: false, error: errorMsg };
    }

    logger.log('[WhatsApp OTP] ✅ OTP sent successfully');
    return {
      success: true,
      messageId: data.messageId || data.id || data.message_id || 'sent',
    };
  } catch (error: any) {
    console.error('[WhatsApp OTP] Exception:', error);
    return { success: false, error: error.message || 'Failed to send OTP' };
  }
}

/**
 * Send welcome message to newly registered user with support contact number
 */
export async function sendWelcomeMessageToUser(
  userPhoneNumber: string,
  userName: string,
  userId: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const supportNumber = '+919944776689';
    
    // Format all parameters according to the template
    const templateParams = [
      userName,                // {{1}} - User Name
      supportNumber,           // {{2}} - Support WhatsApp Number
    ];

    logger.log('[WhatsApp] Sending welcome message to user with template: welcome_new_user');
    logger.log('[WhatsApp] Parameters:', templateParams);

    // Send via WhatsApp
    const credentials = await getMyDreamsCredentials();
    if (!credentials) {
      return {
        success: false,
        error: 'MyDreams WhatsApp API not configured',
      };
    }

    const formattedContact = formatPhoneNumber(userPhoneNumber);

    // Build the API URL
    const url = new URL('https://wa.mydreamstechnology.in/api/sendtemplate.php');
    url.searchParams.append('LicenseNumber', credentials.licenseNumber);
    url.searchParams.append('APIKey', credentials.apiKey);
    url.searchParams.append('Contact', formattedContact);
    url.searchParams.append('Template', 'welcome_new_user');
    url.searchParams.append('Param', templateParams.join(','));

    logger.log('[WhatsApp] Welcome message API URL prepared');
    logger.log('- Contact:', formattedContact);
    logger.log('- Template: welcome_new_user');
    logger.log('- Params Count:', templateParams.length);

    // Send the request
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();
    logger.log('[WhatsApp] Welcome message API response:', data);

    // Check success - MyDreams API can return different formats
    const isSuccess = 
      data.status === 'success' || 
      data.ApiResponse === 'Success' ||
      data.ApiMessage?.Status === 'Success';

    // Try to log to database (non-blocking)
    try {
      await prisma.whatsAppLog.create({
        data: {
          userId: userId,
          phoneNumber: formattedContact,
          recipientName: userName,
          template: 'welcome_new_user',
          parameters: { userName, supportNumber },
          messageId: data.messageId || data.id || data.message_id || null,
          status: isSuccess ? 'sent' : 'failed',
          errorMessage: !isSuccess ? JSON.stringify(data) : null,
        },
      });
    } catch (dbError) {
      console.error('[WhatsApp] Error logging welcome message to database:', dbError);
    }

    if (!isSuccess) {
      const errorMsg = data.error || data.message || data.ApiMessage?.ErrorMessage?.error?.message || 'Unknown error from MyDreams API';
      console.error('[WhatsApp] Welcome message returned error:', data);
      return {
        success: false,
        error: errorMsg,
      };
    }

    logger.log('[WhatsApp] ✅ Welcome message sent successfully to user');
    return {
      success: true,
      messageId: data.messageId || data.id || data.message_id || 'sent',
    };
  } catch (error: any) {
    console.error('[WhatsApp] Error sending welcome message to user:', error);
    return {
      success: false,
      error: error.message || 'Failed to send welcome message',
    };
  }
}

