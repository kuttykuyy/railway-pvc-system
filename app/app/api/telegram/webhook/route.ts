/**
 * POST /api/telegram/webhook
 * Receives updates from Telegram Bot API
 */

import { NextRequest, NextResponse } from 'next/server';
import { handleTelegramMessage } from '@/lib/telegram-message-handler';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Handle text messages
    const message = body.message;
    if (message && message.text) {
      const chatId = String(message.chat.id);
      const text = message.text;

      console.log(`[Telegram] Chat ${chatId}: ${text}`);

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

      console.log(`[Telegram] Callback ${chatId}: ${data}`);

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
