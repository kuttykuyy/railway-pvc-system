import { logger } from './logger';
/**
 * Telegram Bot API utilities
 */

const TELEGRAM_API = 'https://api.telegram.org';

function getBotToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN not configured');
  return token;
}

export function getTelegramWebhookSecret(): string {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret) throw new Error('TELEGRAM_WEBHOOK_SECRET not configured');
  return secret;
}

function apiUrl(method: string): string {
  return `${TELEGRAM_API}/bot${getBotToken()}/${method}`;
}

/**
 * Send a text message to a Telegram chat
 */
export async function sendTelegramMessage(
  chatId: string,
  text: string,
  options?: {
    parseMode?: 'Markdown' | 'MarkdownV2' | 'HTML';
    replyMarkup?: any;
  }
): Promise<any> {
  try {
    const body: any = {
      chat_id: chatId,
      text,
      parse_mode: options?.parseMode || 'HTML',
    };
    if (options?.replyMarkup) {
      body.reply_markup = options.replyMarkup;
    }

    const res = await fetch(apiUrl('sendMessage'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    if (!data.ok) {
      console.error('Telegram sendMessage error:', data);
    }
    return data;
  } catch (err) {
    console.error('Telegram sendMessage exception:', err);
    throw err;
  }
}

/**
 * Send a document (PDF) to a Telegram chat
 */
export async function sendTelegramDocument(
  chatId: string,
  documentUrl: string,
  caption?: string
): Promise<any> {
  try {
    const body: any = {
      chat_id: chatId,
      document: documentUrl,
      caption: caption || '',
      parse_mode: 'HTML',
    };

    const res = await fetch(apiUrl('sendDocument'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    if (!data.ok) {
      console.error('Telegram sendDocument error:', data);
    }
    return data;
  } catch (err) {
    console.error('Telegram sendDocument exception:', err);
    throw err;
  }
}

/**
 * Download a file that a user sent to the bot.
 *
 * Telegram is two steps: getFile turns a file_id into a temporary file_path, then
 * the actual bytes are fetched from api.telegram.org/file/bot<token>/<path>.
 * Returns the file bytes as a Buffer (throws on any failure).
 */
export async function downloadTelegramFile(fileId: string): Promise<Buffer> {
  const infoRes = await fetch(apiUrl('getFile'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file_id: fileId }),
  });
  const info = await infoRes.json();
  if (!info.ok || !info.result?.file_path) {
    throw new Error(`Telegram getFile failed: ${JSON.stringify(info).slice(0, 200)}`);
  }
  const fileUrl = `${TELEGRAM_API}/file/bot${getBotToken()}/${info.result.file_path}`;
  const fileRes = await fetch(fileUrl);
  if (!fileRes.ok) {
    throw new Error(`Telegram file download failed: HTTP ${fileRes.status}`);
  }
  return Buffer.from(await fileRes.arrayBuffer());
}

/**
 * Send a "typing"/"upload document" chat action so the user sees the bot is busy
 * while a slow AI extraction runs. Best-effort — never throws.
 */
export async function sendTelegramChatAction(
  chatId: string,
  action: 'typing' | 'upload_document' = 'typing',
): Promise<void> {
  try {
    await fetch(apiUrl('sendChatAction'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, action }),
    });
  } catch {
    // ignore — this is only a nicety
  }
}

/**
 * Send a document from raw bytes (multipart upload) — used to return a generated
 * PDF report to the chat. `documentUrl` variant above only works for public URLs.
 */
export async function sendTelegramDocumentBytes(
  chatId: string,
  bytes: Buffer | Uint8Array,
  filename: string,
  caption?: string,
): Promise<any> {
  try {
    const form = new FormData();
    form.append('chat_id', chatId);
    if (caption) {
      form.append('caption', caption);
      form.append('parse_mode', 'HTML');
    }
    const blob = new Blob([Buffer.from(bytes)], { type: 'application/pdf' });
    form.append('document', blob, filename);

    const res = await fetch(apiUrl('sendDocument'), { method: 'POST', body: form });
    const data = await res.json();
    if (!data.ok) {
      console.error('Telegram sendDocumentBytes error:', data);
    }
    return data;
  } catch (err) {
    console.error('Telegram sendDocumentBytes exception:', err);
    throw err;
  }
}

/**
 * Register webhook URL with Telegram
 */
export async function setTelegramWebhook(webhookUrl: string, secretToken?: string): Promise<any> {
  try {
    const body: Record<string, string> = { url: webhookUrl };
    if (secretToken) {
      body.secret_token = secretToken;
    }

    const res = await fetch(apiUrl('setWebhook'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    logger.log('Telegram setWebhook result:', data);
    return data;
  } catch (err) {
    console.error('Telegram setWebhook exception:', err);
    throw err;
  }
}

/**
 * Get current webhook info
 */
export async function getTelegramWebhookInfo(): Promise<any> {
  const res = await fetch(apiUrl('getWebhookInfo'));
  return res.json();
}

/**
 * Send inline keyboard (button choices)
 */
export function inlineKeyboard(rows: Array<Array<{ text: string; callback_data: string }>>) {
  return { inline_keyboard: rows };
}

/**
 * Build a simple reply keyboard
 */
export function replyKeyboard(buttons: string[][], oneTime = true) {
  return {
    keyboard: buttons.map(row => row.map(text => ({ text }))),
    one_time_keyboard: oneTime,
    resize_keyboard: true,
  };
}

