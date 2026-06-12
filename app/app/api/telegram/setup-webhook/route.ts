import { logger } from '@/lib/logger';
/**
 * GET /api/telegram/setup-webhook
 * Registers the webhook URL with Telegram
 * Call this once after deploying
 */

import { NextRequest, NextResponse } from 'next/server';
import { setTelegramWebhook, getTelegramWebhookInfo, getTelegramWebhookSecret } from '@/lib/telegram-api';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
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

