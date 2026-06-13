import { logger } from '@/lib/logger';
/**
 * GET /api/telegram/setup-webhook
 * Registers the webhook URL with Telegram
 * Call this once after deploying
 */

import { NextRequest, NextResponse } from 'next/server';
import { setTelegramWebhook, getTelegramWebhookInfo, getTelegramWebhookSecret } from '@/lib/telegram-api';
import { validateAdminAccess } from '@/lib/role-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    // Only admins can register or inspect the Telegram webhook
    const { authorized, message } = await validateAdminAccess(request);
    if (!authorized) {
      return NextResponse.json(
        { error: message || 'Admin access required' },
        { status: 403 }
      );
    }

    const baseUrl = process.env.NEXTAUTH_URL || 'https://irpvc.in';
    const webhookUrl = `${baseUrl}/api/telegram/webhook`;

    // Check current webhook
    const currentInfo = await getTelegramWebhookInfo();
    logger.log('Current webhook info:', currentInfo);

    // Set new webhook with secret token so Telegram signs future requests
    const secretToken = getTelegramWebhookSecret();
    const result = await setTelegramWebhook(webhookUrl, secretToken);

    return NextResponse.json({
      success: result.ok,
      webhookUrl,
      result,
      currentInfo: currentInfo?.result,
    });
  } catch (error: any) {
    console.error('Error setting up Telegram webhook:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

