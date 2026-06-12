import { logger } from '@/lib/logger';
/**
 * POST /api/telegram/webhook
 * Receives updates from Telegram Bot API
 */

import { NextRequest, NextResponse } from 'next/server';
import { handleTelegramMessage } from '@/lib/telegram-message-handler';
import { getTelegramWebhookSecret } from '@/lib/telegram-api';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    // Validate Telegram's webhook secret token to prevent spoofed requests
    const secretToken = request.headers.get('x-telegram-bot-api-secret-token');
    if (secretToken !== getTelegramWebhookSecret()) {
      console.warn('[Telegram] Invalid or missing webhook secret token');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();

    // Handle text messages
    const message = body.message;
    if (message && message.text) {
      const chatId = String(message.chat.id);
      const text = message.text;

      logger.log(`[Telegram] Chat ${chatId}: ${text}`);

      // Process asynchronously so we respond quickly to Telegram
      handleTelegramMessage(chatId, text).catch(err =>
        console.error('[Telegram] Handler error:', err)
      );
    }

    // Handle callback queries (inline keyboard button presses)
    const callbackQuery = body.callback_query;
    if (callbackQuery) {
      const chatId = String(callbackQuery.message.chat.id);
      const data = callbackQuery.data;

      logger.log(`[Telegram] Callback ${chatId}: ${data}`);

      handleTelegramMessage(chatId, data).catch(err =>
        console.error('[Telegram] Callback handler error:', err)
      );
    }

    // Always return 200 to Telegram
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[Telegram] Webhook error:', error);
    // Still return 200 to prevent Telegram from retrying
    return NextResponse.json({ ok: true });
  }
}

// GET — used to check webhook is live
export async function GET() {
  return NextResponse.json({
    status: 'Telegram webhook active',
    timestamp: new Date().toISOString(),
  });
}

