/**
 * Daily cron: automatically nudge Telegram chats that stalled mid-PVC-flow.
 *
 * A chat qualifies when it is waiting on the user (mid-flow step, or a report
 * quoted but unpaid) and has been silent for 24h+. The shared rules in
 * lib/telegram-nudge cap it hard: one nudge per 24h, and at most MAX_AUTO_NUDGES
 * automatic ones per chat ever — after that only a manual nudge can follow up.
 *
 * Auth: Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}`. A manual
 * trigger with `?secret=<CRON_SECRET>` is also accepted. Fails closed if
 * CRON_SECRET is unset.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { sendNudge, NUDGEABLE_STEPS } from '@/lib/telegram-nudge';
import { notifyTelegramAdmin } from '@/lib/telegram-api';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// Safety valve: never blast more than this many nudges in one run.
const MAX_PER_RUN = 20;

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // fail closed — no secret configured, no access
  const header = request.headers.get('authorization');
  if (header === `Bearer ${secret}`) return true;
  if (request.nextUrl.searchParams.get('secret') === secret) return true;
  return false;
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const stalledBefore = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Candidates: silent for 24h+ and either mid-flow or holding an unpaid report.
    // Pending-report chats can be at any step (often IDLE), so fetch stalled chats
    // and filter in code — the table is small.
    const stalled = await prisma.telegramConversation.findMany({
      where: { lastMessageAt: { lt: stalledBefore } },
      orderBy: { lastMessageAt: 'desc' },
      take: 200,
    });

    const candidates = stalled.filter((c) => {
      const data = (c.conversationData as any) || {};
      return NUDGEABLE_STEPS.includes(c.currentStep) || !!data.docPendingReport;
    });

    let sent = 0;
    let skipped = 0;
    const sentTo: string[] = [];
    for (const conv of candidates) {
      if (sent >= MAX_PER_RUN) break;
      const result = await sendNudge(conv as any, true);
      if (result.sent) {
        sent++;
        sentTo.push(conv.chatId);
      } else {
        skipped++;
      }
    }

    if (sent > 0) {
      notifyTelegramAdmin(
        `🤖 <b>Auto-nudge run</b>\n\nSent ${sent} follow-up(s) to stalled chats:\n` +
          sentTo.map((id) => `• <code>${id}</code>`).join('\n'),
      ).catch(() => {});
    }

    console.log(`[cron/telegram-nudge] candidates=${candidates.length} sent=${sent} skipped=${skipped}`);
    return NextResponse.json({ candidates: candidates.length, sent, skipped });
  } catch (error: any) {
    console.error('[cron/telegram-nudge] failed:', error);
    return NextResponse.json({ error: error?.message || 'Cron failed' }, { status: 500 });
  }
}
