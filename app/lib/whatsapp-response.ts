import { logger } from './logger';

/**
 * WhatsApp Response Handler
 * Sends messages back to users via MyDreams API
 */

import { prisma } from './db';

interface MyDreamsCredentials {
  licenseNumber: string;
  apiKey: string;
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
 * Send a text message via WhatsApp
 */
export async function sendWhatsAppTextMessage(
  phoneNumber: string,
  message: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const credentials = await getMyDreamsCredentials();
    if (!credentials) {
      return {
        success: false,
        error: 'WhatsApp API not configured',
      };
    }

    // Build the API URL for sending text message
    const url = new URL('https://wa.mydreamstechnology.in/api/sendtextmessage.php');
    url.searchParams.append('LicenseNumber', credentials.licenseNumber);
    url.searchParams.append('APIKey', credentials.apiKey);
    url.searchParams.append('Contact', phoneNumber);
    url.searchParams.append('Message', message);

    logger.log('Sending WhatsApp text message:', {
      contact: phoneNumber,
      messageLength: message.length,
    });

    // Send the request
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });

    const responseText = await response.text();
    logger.log('MyDreams API Response:', {
      status: response.status,
      body: responseText,
    });

    if (!response.ok) {
      return {
        success: false,
        error: `Failed to send message: ${response.statusText}`,
      };
    }

    return { success: true };
  } catch (error: any) {
    console.error('Error sending WhatsApp text message:', error);
    return {
      success: false,
      error: error.message || 'Unknown error',
    };
  }
}

/**
 * Send a button message via WhatsApp
 */
export async function sendWhatsAppButtonMessage(
  phoneNumber: string,
  message: string,
  buttons: Array<{ id: string; text: string }>
): Promise<{ success: boolean; error?: string }> {
  try {
    const credentials = await getMyDreamsCredentials();
    if (!credentials) {
      return {
        success: false,
        error: 'WhatsApp API not configured',
      };
    }

    // Format buttons for MyDreams API (comma-separated: id~text,id~text)
    const buttonStr = buttons.map((b) => `${b.id}~${b.text}`).join(',');

    // Build the API URL
    const url = new URL('https://wa.mydreamstechnology.in/api/sendmediamessage.php');
    url.searchParams.append('LicenseNumber', credentials.licenseNumber);
    url.searchParams.append('APIKey', credentials.apiKey);
    url.searchParams.append('Contact', phoneNumber);
    url.searchParams.append('Message', message);
    url.searchParams.append('Type', 'button');
    url.searchParams.append('Button', buttonStr);

    logger.log('Sending WhatsApp button message:', {
      contact: phoneNumber,
      buttons: buttons.length,
    });

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });

    const responseText = await response.text();
    logger.log('MyDreams API Response:', {
      status: response.status,
      body: responseText,
    });

    if (!response.ok) {
      return {
        success: false,
        error: `Failed to send message: ${response.statusText}`,
      };
    }

    return { success: true };
  } catch (error: any) {
    console.error('Error sending WhatsApp button message:', error);
    return {
      success: false,
      error: error.message || 'Unknown error',
    };
  }
}

