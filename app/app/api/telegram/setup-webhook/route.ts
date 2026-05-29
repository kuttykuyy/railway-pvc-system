/**
 * GET /api/telegram/setup-webhook
 * Registers the webhook URL with Telegram
 * Call this once after deploying
 */

import { NextRequest, NextResponse } from 'next/server';
import { setTelegramWebhook, getTelegramWebhookInfo } from '@/lib/telegram-api';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const baseUrl = process.env.NEXTAUTH_URL || 'https://irpvc.in';
    const webhookUrl = `${baseUrl}/api/telegram/webhook`;

    // Check current webhook
    const currentInfo = await getTelegramWebhookInfo();
    console.log('Current webhook info:', currentInfo);

    // Set new webhook
    const result = await setTelegramWebhook(webhookUrl);

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
