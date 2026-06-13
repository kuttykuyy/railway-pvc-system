import { logger } from './logger';

/**
 * Slack Webhook Notification Utility
 * 
 * This utility handles sending notifications to Slack via webhook URL
 * for important events like new user signups, bill creation, and credit alerts.
 */

const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL || '';

interface SlackNotificationPayload {
  text?: string;
  blocks?: Array<{
    type: string;
    text?: {
      type: string;
      text: string;
    };
    fields?: Array<{
      type: string;
      text: string;
    }>;
    elements?: Array<{
      type: string;
      text: string;
    }>;
  }>;
}

interface NewUserSignupData {
  email: string;
  fullName: string;
  userId: string;
  signupDate: Date;
}

interface NewBillData {
  billNo: string;
  contractNo: string;
  userName: string;
  userEmail: string;
  grossAmount: number;
  pvcAmount: number;
  dateOfMeasurement: Date;
  isFinalPvc: boolean;
  isChargeable: boolean;
  processingFee: number;
}

interface LowCreditData {
  userName: string;
  userEmail: string;
  userId: string;
  currentBalance: number;
  billCost: number;
  canAffordBills: number;
}

interface CreditTopupRequestData {
  userName: string;
  userEmail: string;
  userId: string;
  currentBalance: number;
  requestedAmount?: number;
  message?: string;
  requestDate: Date;
}

/**
 * Send a notification to Slack webhook
 */
async function sendSlackNotification(payload: SlackNotificationPayload): Promise<boolean> {
  try {
    const response = await fetch(SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      console.error('❌ Slack webhook error:', response.status, response.statusText);
      return false;
    }

    logger.log('✅ Slack notification sent successfully');
    return true;
  } catch (error) {
    console.error('❌ Failed to send Slack notification:', error);
    return false;
  }
}

/**
 * Send a new user signup notification to Slack
 */
export async function notifyNewUserSignup(data: NewUserSignupData): Promise<boolean> {
  const { email, fullName, userId, signupDate } = data;
  
  const formattedDate = new Date(signupDate).toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kolkata'
  });

  const payload: SlackNotificationPayload = {
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '🎉 New User Signup - Railway PVC System'
        }
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Name:*\n${fullName}`
          },
          {
            type: 'mrkdwn',
            text: `*Email:*\n${email}`
          },
          {
            type: 'mrkdwn',
            text: `*User ID:*\n${userId}`
          },
          {
            type: 'mrkdwn',
            text: `*Signup Date:*\n${formattedDate}`
          }
        ]
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Account Status:*\n✅ Free trial active\n💳 Credit balance: 0\n📊 Tier: Standard`
        }
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `Notification sent from Railway PVC System at ${formattedDate}`
          }
        ]
      }
    ]
  };

  return await sendSlackNotification(payload);
}

/**
 * Send a generic notification to Slack
 */
export async function sendGenericSlackNotification(message: string): Promise<boolean> {
  const payload: SlackNotificationPayload = {
    text: message
  };

  return await sendSlackNotification(payload);
}

export type AlertLevel = 'info' | 'warning' | 'critical';

/**
 * Send a structured monitoring/operations alert to Slack.
 * Use this for errors, warnings, and important system events.
 */
export async function sendSlackAlert(
  level: AlertLevel,
  title: string,
  fields: Record<string, string>
): Promise<boolean> {
  if (!process.env.ENABLE_SLACK_NOTIFICATIONS || process.env.ENABLE_SLACK_NOTIFICATIONS !== 'true') {
    logger.log(`[Slack Alert] ${level}: ${title} (slack notifications disabled)`);
    return false;
  }

  const emoji = { info: 'ℹ️', warning: '⚠️', critical: '🚨' }[level];
  const formattedDate = new Date().toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kolkata'
  });

  const payload: SlackNotificationPayload = {
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `${emoji} ${title}`
        }
      },
      {
        type: 'section',
        fields: Object.entries(fields).map(([key, value]) => ({
          type: 'mrkdwn',
          text: `*${key}:*\n${value || 'N/A'}`
        }))
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `Alert sent from Railway PVC System at ${formattedDate}`
          }
        ]
      }
    ]
  };

  return sendSlackNotification(payload);
}

/**
 * Send a new bill creation notification to Slack
 */
export async function notifyNewBillCreated(data: NewBillData): Promise<boolean> {
  const { 
    billNo, 
    contractNo, 
    userName, 
    userEmail, 
    grossAmount, 
    pvcAmount, 
    dateOfMeasurement,
    isFinalPvc,
    isChargeable,
    processingFee
  } = data;
  
  const formattedDate = new Date().toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kolkata'
  });

  const measurementDateFormatted = new Date(dateOfMeasurement).toLocaleDateString('en-IN', {
    dateStyle: 'medium',
    timeZone: 'Asia/Kolkata'
  });

  const payload: SlackNotificationPayload = {
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '📄 New Bill Created - Railway PVC System'
        }
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Bill Number:*\n${billNo}`
          },
          {
            type: 'mrkdwn',
            text: `*Contract:*\n${contractNo}`
          },
          {
            type: 'mrkdwn',
            text: `*User:*\n${userName}`
          },
          {
            type: 'mrkdwn',
            text: `*Email:*\n${userEmail}`
          },
          {
            type: 'mrkdwn',
            text: `*Gross Amount:*\n₹${grossAmount.toLocaleString('en-IN')}`
          },
          {
            type: 'mrkdwn',
            text: `*PVC Amount:*\n₹${pvcAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
          },
          {
            type: 'mrkdwn',
            text: `*Measurement Date:*\n${measurementDateFormatted}`
          },
          {
            type: 'mrkdwn',
            text: `*Bill Type:*\n${isFinalPvc ? '✅ Final PVC' : '📋 Running Bill'}`
          }
        ]
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Payment Status:*\n${isChargeable ? `💳 Paid - ₹${processingFee.toLocaleString('en-IN')} deducted` : '🎁 Free trial used'}`
        }
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `Notification sent from Railway PVC System at ${formattedDate}`
          }
        ]
      }
    ]
  };

  return await sendSlackNotification(payload);
}

/**
 * Send a low credit warning notification to Slack
 */
export async function notifyLowCredit(data: LowCreditData): Promise<boolean> {
  const { userName, userEmail, userId, currentBalance, billCost, canAffordBills } = data;
  
  const formattedDate = new Date().toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kolkata'
  });

  const payload: SlackNotificationPayload = {
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '⚠️ Low Credit Alert - Railway PVC System'
        }
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*User:*\n${userName}`
          },
          {
            type: 'mrkdwn',
            text: `*Email:*\n${userEmail}`
          },
          {
            type: 'mrkdwn',
            text: `*User ID:*\n${userId}`
          },
          {
            type: 'mrkdwn',
            text: `*Current Balance:*\n₹${currentBalance.toLocaleString('en-IN')}`
          },
          {
            type: 'mrkdwn',
            text: `*Bill Cost:*\n₹${billCost.toLocaleString('en-IN')}`
          },
          {
            type: 'mrkdwn',
            text: `*Bills Remaining:*\n${canAffordBills} bill${canAffordBills !== 1 ? 's' : ''}`
          }
        ]
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `⚠️ *Warning:* User is running low on credits. They can afford approximately ${canAffordBills} more bill${canAffordBills !== 1 ? 's' : ''} before running out.`
        }
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `Notification sent from Railway PVC System at ${formattedDate}`
          }
        ]
      }
    ]
  };

  return await sendSlackNotification(payload);
}

/**
 * Send a credit top-up request notification to Slack
 */
export async function notifyCreditTopupRequest(data: CreditTopupRequestData): Promise<boolean> {
  const { 
    userName, 
    userEmail, 
    userId, 
    currentBalance, 
    requestedAmount, 
    message, 
    requestDate 
  } = data;
  
  const formattedDate = new Date(requestDate).toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kolkata'
  });

  const payload: SlackNotificationPayload = {
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '💰 Credit Top-Up Request - Railway PVC System'
        }
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*User:*\n${userName}`
          },
          {
            type: 'mrkdwn',
            text: `*Email:*\n${userEmail}`
          },
          {
            type: 'mrkdwn',
            text: `*User ID:*\n${userId}`
          },
          {
            type: 'mrkdwn',
            text: `*Current Balance:*\n₹${currentBalance.toLocaleString('en-IN')}`
          }
        ]
      },
      ...(requestedAmount ? [{
        type: 'section' as const,
        text: {
          type: 'mrkdwn' as const,
          text: `*Requested Amount:*\n₹${requestedAmount.toLocaleString('en-IN')}`
        }
      }] : []),
      ...(message ? [{
        type: 'section' as const,
        text: {
          type: 'mrkdwn' as const,
          text: `*Customer Message:*\n"${message}"`
        }
      }] : []),
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `📞 *Action Required:* Please contact this user to process their credit top-up request.`
        }
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `Request received at ${formattedDate}`
          }
        ]
      }
    ]
  };

  return await sendSlackNotification(payload);
}

