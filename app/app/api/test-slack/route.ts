import { NextRequest, NextResponse } from 'next/server';
import { sendSlackAlert } from '@/lib/slack-webhook';
import { validateAdminAccess } from '@/lib/role-auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/test-slack
 * Sends a test Slack alert and reports whether it succeeded.
 * Restricted to admin users so the endpoint cannot be used to spam Slack.
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

    const timestamp = new Date().toISOString();
    const slackSent = await sendSlackAlert('info', 'Slack integration test', {
      Source: 'https://irpvc.in/api/test-slack',
      Environment: process.env.VERCEL_ENV || process.env.NODE_ENV || 'unknown',
      Time: timestamp,
      'Triggered By': 'admin-test'
    });

    return NextResponse.json({
      success: true,
      slackSent,
      timestamp,
      message: slackSent
        ? 'Test alert sent to Slack successfully'
        : 'Slack alert was not sent. Check SLACK_WEBHOOK_URL and ENABLE_SLACK_NOTIFICATIONS env vars.'
    });
  } catch (error: any) {
    console.error('Test Slack alert failed:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Internal server error'
      },
      { status: 500 }
    );
  }
}
