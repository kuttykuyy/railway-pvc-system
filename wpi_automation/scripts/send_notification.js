#!/usr/bin/env node

/**
 * WhatsApp Notification Script
 * Sends WPI update notification to admin via WhatsApp
 */

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const https = require('https');

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL
    }
  }
});

// Admin WhatsApp number
const ADMIN_PHONE = '+919944776689';

/**
 * Get MyDreams WhatsApp credentials from admin settings
 */
async function getWhatsAppCredentials() {
  try {
    const [licenseNumber, apiKey] = await Promise.all([
      prisma.adminSettings.findUnique({ where: { key: 'mydreams_license_number' } }),
      prisma.adminSettings.findUnique({ where: { key: 'mydreams_api_key' } })
    ]);
    
    if (!licenseNumber?.value || !apiKey?.value) {
      throw new Error('WhatsApp credentials not configured in admin settings');
    }
    
    return {
      licenseNumber: licenseNumber.value,
      apiKey: apiKey.value
    };
  } catch (error) {
    console.error('❌ Failed to get WhatsApp credentials:', error.message);
    throw error;
  }
}

/**
 * Format phone number for WhatsApp (91XXXXXXXXXX format)
 */
function formatPhoneNumber(phone) {
  let cleaned = phone.replace(/\D/g, '');
  if (!cleaned.startsWith('91') && cleaned.length === 10) {
    cleaned = '91' + cleaned;
  }
  return cleaned;
}

/**
 * Send WhatsApp message using MyDreams API
 */
async function sendWhatsAppMessage(credentials, phoneNumber, message) {
  return new Promise((resolve, reject) => {
    const formattedPhone = formatPhoneNumber(phoneNumber);
    
    // Build API URL - using plain message sending
    const url = new URL('https://wa.mydreamstechnology.in/api/sendText.php');
    url.searchParams.append('LicenseNumber', credentials.licenseNumber);
    url.searchParams.append('APIKey', credentials.apiKey);
    url.searchParams.append('Contact', formattedPhone);
    url.searchParams.append('Message', message);
    
    console.log('📱 Sending WhatsApp message...');
    console.log(`   To: ${formattedPhone}`);
    console.log(`   Message length: ${message.length} characters`);
    
    https.get(url.toString(), (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        console.log('📥 WhatsApp API Response:');
        console.log(`   Status: ${res.statusCode}`);
        console.log(`   Body: ${data}`);
        
        if (res.statusCode === 200) {
          try {
            const response = JSON.parse(data);
            resolve({
              success: true,
              messageId: response.messageId || response.id || 'sent',
              response: response
            });
          } catch (e) {
            // Non-JSON response, treat as success if status is 200
            resolve({
              success: true,
              messageId: 'sent',
              response: data
            });
          }
        } else {
          reject(new Error(`WhatsApp API returned status ${res.statusCode}: ${data}`));
        }
      });
    }).on('error', (error) => {
      console.error('❌ WhatsApp API request failed:', error.message);
      reject(error);
    });
  });
}

/**
 * Format notification message
 */
function formatNotificationMessage(notificationData) {
  const {
    month,
    status,
    updated_count,
    total_count,
    key_values,
    success,
    run_type
  } = notificationData;
  
  const emoji = success ? '✅' : '⚠️';
  const statusEmoji = status === 'Provisional' ? '📊' : '✔️';
  
  let message = `🔔 *WPI Update Complete*\n\n`;
  message += `${emoji} *Status:* ${success ? 'Success' : 'Partial Success'}\n`;
  message += `📅 *Month:* ${month}\n`;
  message += `${statusEmoji} *Data Type:* ${status}\n`;
  message += `📈 *Indices Updated:* ${updated_count}/${total_count}\n\n`;
  
  if (key_values && Object.keys(key_values).length > 0) {
    message += `*Key Values:*\n`;
    if (key_values.cement) {
      message += `• Cement: ${key_values.cement}\n`;
    }
    if (key_values.tmt) {
      message += `• Steel TMT: ${key_values.tmt}\n`;
    }
    if (key_values.all_commodities) {
      message += `• All Commodities: ${key_values.all_commodities}\n`;
    }
    message += `\n`;
  }
  
  message += `🔗 View Dashboard: https://irpvc.in/indices\n`;
  message += `📄 Log: wpi_update_${new Date().toISOString().split('T')[0]}.log`;
  
  return message;
}

/**
 * Send notification
 */
async function sendNotification(notificationFile) {
  console.log('📱 Starting WhatsApp notification process...');
  console.log(`📁 Notification file: ${notificationFile}`);
  
  try {
    // Read notification data
    const notificationData = JSON.parse(fs.readFileSync(notificationFile, 'utf8'));
    console.log('📊 Notification data loaded:', notificationData);
    
    // Get WhatsApp credentials
    const credentials = await getWhatsAppCredentials();
    console.log('✅ WhatsApp credentials retrieved');
    
    // Format message
    const message = formatNotificationMessage(notificationData);
    console.log('\n📝 Formatted message:');
    console.log('─'.repeat(60));
    console.log(message);
    console.log('─'.repeat(60));
    
    // Send WhatsApp message
    const result = await sendWhatsAppMessage(credentials, ADMIN_PHONE, message);
    
    console.log('\n✅ WhatsApp notification sent successfully');
    console.log(`   Message ID: ${result.messageId}`);
    
    // Log to database
    try {
      await prisma.whatsAppLog.create({
        data: {
          phoneNumber: formatPhoneNumber(ADMIN_PHONE),
          recipientName: 'Admin',
          template: 'wpi_update_notification',
          parameters: notificationData,
          status: 'sent',
          messageId: result.messageId,
          sentAt: new Date()
        }
      });
      console.log('✅ Notification logged to database');
    } catch (dbError) {
      console.error('⚠️  Failed to log notification to database:', dbError.message);
      // Don't fail if logging fails
    }
    
    await prisma.$disconnect();
    console.log('\n' + '='.repeat(80));
    console.log('✅ WhatsApp Notification Completed Successfully');
    console.log('='.repeat(80));
    
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ Failed to send WhatsApp notification:', error);
    console.error(error.stack);
    
    await prisma.$disconnect();
    process.exit(1);
  }
}

// Main execution
const notificationFile = process.argv[2];
if (!notificationFile) {
  console.error('❌ Error: No notification file provided');
  console.error('Usage: node send_notification.js <notification_file.json>');
  process.exit(1);
}

if (!fs.existsSync(notificationFile)) {
  console.error(`❌ Error: Notification file not found: ${notificationFile}`);
  process.exit(1);
}

sendNotification(notificationFile);
