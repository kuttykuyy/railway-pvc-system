/**
 * Admin-only: send a follow-up ("nudge") to a Telegram chat that stalled mid-flow.
 *
 * POST { chatId } — sends a message written for the exact step where that chat
 * stopped. The message text and the restraint rules (one nudge per 24h) live in
 * lib/telegram-nudge, shared with the daily auto-nudge cron.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { sendNudge } from '@/lib/telegram-nudge';

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

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const { chatId } = await req.json();
    if (!chatId) return NextResponse.json({ error: 'chatId is required' }, { status: 400 });

    const conv = await prisma.telegramConversation.findUnique({ where: { chatId: String(chatId) } });
    if (!conv) return NextResponse.json({ error: 'Chat not found' }, { status: 404 });

    const result = await sendNudge(conv as any, false);
    if (!result.sent) {
      const status = result.reason?.startsWith('Already nudged') ? 429 : 502;
      return NextResponse.json({ sent: false, error: result.reason }, { status });
    }
    return NextResponse.json({ sent: true, message: `Nudge sent to ${chatId}.` });
  } catch (error: any) {
    console.error('telegram-nudge error:', error);
    return NextResponse.json({ error: error?.message || 'Nudge failed' }, { status: 500 });
  }
}
