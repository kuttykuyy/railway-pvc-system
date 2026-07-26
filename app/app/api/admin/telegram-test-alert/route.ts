/**
 * Admin-only: send a test admin alert, to verify TELEGRAM_ADMIN_CHAT_ID works.
 *
 * GET  — reports whether the admin chat id is configured (and how many recipients).
 * POST — actually sends a test alert to those recipients.
 *
 * Opening this in a browser does a GET, so it reports first and never sends by
 * accident; the page's button issues the POST.
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { notifyTelegramAdmin } from '@/lib/telegram-api';

export const dynamic = 'force-dynamic';

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return { ok: false as const, status: 401, error: 'Unauthorized' };
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { role: true },
  });
  if (user?.role !== 'admin' && user?.role !== 'superadmin') {
    return { ok: false as const, status: 403, error: 'Access denied. Admin only.' };
  }
  return { ok: true as const };
}

function recipients(): string[] {
  return String(process.env.TELEGRAM_ADMIN_CHAT_ID || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const ids = recipients();
  return NextResponse.json({
    configured: ids.length > 0,
    recipientCount: ids.length,
    // Only the tail of each id, enough to confirm it's the expected chat.
    recipients: ids.map((id) => '…' + id.slice(-4)),
    message: ids.length
      ? 'Configured. POST to this URL to send a test alert.'
      : 'TELEGRAM_ADMIN_CHAT_ID is not set. Send /whoami to the bot to get your chat id, add it in Vercel, then redeploy.',
  });
}

export async function POST() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const ids = recipients();
  if (!ids.length) {
    return NextResponse.json(
      { sent: false, error: 'TELEGRAM_ADMIN_CHAT_ID is not set — nothing to send to.' },
      { status: 400 },
    );
  }

  const when = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
  await notifyTelegramAdmin(
    `🔔 <b>Test alert</b>\n\nAdmin notifications are working.\nYou'll get a message like this whenever someone uses the bot.\n\n<i>${when}</i>`,
  );

  // notifyTelegramAdmin never throws (alerts must not break anything), so this
  // confirms the attempt was made — check the chat to confirm delivery.
  return NextResponse.json({
    sent: true,
    recipientCount: ids.length,
    message: `Test alert sent to ${ids.length} recipient(s). Check your Telegram chat. If nothing arrives, that chat has probably never messaged the bot — send it /whoami first.`,
  });
}
