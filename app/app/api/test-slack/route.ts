import { NextRequest, NextResponse } from 'next/server';
import { sendGenericSlackNotification } from '@/lib/slack-webhook';
import { validateAdminAccess } from '@/lib/role-auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/test-slack
 * Sends a test notification to BOTH Slack and the Telegram admin chat and reports
 * what is configured. Restricted to admin users so it can't be used to spam.
 *
 * Uses the generic (non-gated) sender so the test always fires — unlike the ops
 * alerts, which are gated behind ENABLE_SLACK_NOTIFICATIONS.
 */
export async function GET(request: NextRequest) {
  try {
    const { authorized, message } = await validateAdminAccess(request);
    if (!authorized) {
      return NextResponse.json(
        { success: false, error: message || 'Admin access required' },
        { status: 403 }
      );
    }

    const timestamp = new Date().toLocaleString('en-IN', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Asia/Kolkata',
    });
    const env = process.env.VERCEL_ENV || process.env.NODE_ENV || 'unknown';

    // Goes through sendSlackNotification, which mirrors to the Telegram admin chat.
    const slackSent = await sendGenericSlackNotification(
      `✅ *Notification test* — Railway PVC System\n*Environment:* ${env}\n*Time:* ${timestamp}\n\nIf you can read this on Telegram, the Slack → Telegram mirror is working.`
    );

    const telegramConfigured = !!process.env.TELEGRAM_ADMIN_CHAT_ID;
    const slackConfigured = !!process.env.SLACK_WEBHOOK_URL;

    return NextResponse.json({
      success: true,
      slackSent,
      slackConfigured,
      telegramConfigured,
      timestamp,
      message:
        `Test fired. Slack ${slackConfigured ? (slackSent ? 'sent' : 'failed') : 'not configured'}; ` +
        `Telegram ${telegramConfigured ? 'sent (check the admin chat)' : 'not configured — set TELEGRAM_ADMIN_CHAT_ID'}.`,
    });
  } catch (error: any) {
    console.error('Test notification failed:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
