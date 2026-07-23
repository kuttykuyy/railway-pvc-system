import { logger } from '@/lib/logger';
/**
 * POST /api/telegram/webhook
 * Receives updates from Telegram Bot API
 */

import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import { handleTelegramMessage } from '@/lib/telegram-message-handler';
import { handleTelegramDocument } from '@/lib/telegram-document-flow';
import { getTelegramWebhookSecret } from '@/lib/telegram-api';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    // Validate Telegram's webhook secret token to prevent spoofed requests
    const secretToken = request.headers.get('x-telegram-bot-api-secret-token');
    if (secretToken !== getTelegramWebhookSecret()) {
      console.warn('[Telegram] Invalid or missing webhook secret token');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();

    // Handle document (PDF) uploads — agreement + bill → PVC flow
    const message = body.message;
    if (message && message.document) {
      const chatId = String(message.chat.id);
      const doc = message.document;
      logger.log(`[Telegram] Chat ${chatId}: document ${doc.file_name || doc.file_id}`);

      // Reading + extracting a PDF is slow (AI calls), so run it AFTER the 200
      // response via after() — on Vercel this keeps the function alive instead of
      // killing the promise the moment we reply to Telegram.
      after(
        handleTelegramDocument(chatId, {
          file_id: doc.file_id,
          file_name: doc.file_name,
          mime_type: doc.mime_type,
          file_size: doc.file_size,
        }).catch(err => console.error('[Telegram] Document handler error:', err)),
      );
    }
    // Handle text messages
    else if (message && message.text) {
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

