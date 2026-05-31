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
 * Register webhook URL with Telegram
 */
export async function setTelegramWebhook(webhookUrl: string): Promise<any> {
  try {
    const res = await fetch(apiUrl('setWebhook'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: webhookUrl }),
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

