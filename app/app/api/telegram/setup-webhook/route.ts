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

    // Telegram requires a full public HTTPS URL. Pick the base URL in this order:
    //   1. ?baseUrl=... query override (e.g. https://irpvc.in)
    //   2. the domain this request came in on (so opening the page on irpvc.in
    //      registers the webhook on irpvc.in — the public site — not the platform
    //      host in NEXTAUTH_URL)
    //   3. NEXTAUTH_URL, then a hard default.
    const requestHost = request.headers.get('x-forwarded-host') || request.headers.get('host') || '';
    let baseUrl =
      request.nextUrl.searchParams.get('baseUrl') ||
      (requestHost ? `https://${requestHost}` : '') ||
      process.env.NEXTAUTH_URL ||
      'https://irpvc.in';
    if (!/^https?:\/\//i.test(baseUrl)) baseUrl = `https://${baseUrl}`;
    baseUrl = baseUrl.replace(/\/+$/, '');
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

