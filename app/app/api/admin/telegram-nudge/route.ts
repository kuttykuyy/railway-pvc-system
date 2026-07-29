/**
 * Admin-only: send a follow-up ("nudge") to a Telegram chat that stalled mid-flow.
 *
 * POST { chatId } — looks at where that chat stopped and sends a message written
 * for that exact step (attach the agreement, send the bill, finish payment, …).
 *
 * Guard: a chat is nudged at most once per 24h (adminNudgeAt on the conversation),
 * so an eager admin can't accidentally spam a user. Telegram also simply fails the
 * send if the user has blocked the bot — that comes back as an error, not silence.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { sendTelegramMessage } from '@/lib/telegram-api';

export const dynamic = 'force-dynamic';

const NUDGE_COOLDOWN_MS = 24 * 60 * 60 * 1000;

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

/** Strip the internal per-chat namespace suffix for display. */
function displayAgreementNo(stored: string | null | undefined): string {
  return String(stored || '').replace(/\s*·\s*tg:\S+$/i, '').trim();
}

/** The message that fits where this chat stopped. */
function nudgeText(step: string, data: any): string {
  const agr = displayAgreementNo(data?.docContractAgreementNo);

  if (data?.docPendingReport) {
    return (
      `👋 Just checking in!\n\n` +
      `Your PVC statement${agr ? ` for <b>${agr}</b>` : ''} is calculated and ready.\n\n` +
      `💳 The payment link is in the messages above — pay by UPI/card and the PDF arrives here instantly.\n` +
      `Already paid? Send /paid and I'll deliver it.\n\n` +
      `<i>Questions? Just reply here.</i>`
    );
  }

  switch (step) {
    case 'AWAITING_AGREEMENT_PDF':
      return (
        `👋 Still there?\n\n` +
        `📎 Just attach your <b>tender agreement PDF</b> (tap the clip button) and I'll read the schedules, rates and base month for you.\n\n` +
        `Seeing your PVC amount is <b>free</b> — you only pay if you want the full statement.`
      );
    case 'AWAITING_BILL_PDF':
      return (
        `👋 Almost there!\n\n` +
        `${agr ? `Your agreement <b>${agr}</b> is already set up. ` : ''}📎 Just send the <b>running bill (RA bill) PDF</b> and I'll calculate your PVC — free.`
      );
    case 'AWAITING_ZONE':
      return (
        `👋 One quick answer needed!\n\n` +
        `🚉 Please confirm your <b>railway zone</b> (tap the button above, or reply with the code, e.g. SR) and I'll continue with your PVC.`
      );
    case 'AWAITING_TENDER_DATE':
      return (
        `👋 One date needed!\n\n` +
        `📅 Please reply with the <b>tender closing date</b> (DD/MM/YYYY) and I'll finish your PVC calculation.`
      );
    default:
      return (
        `👋 Hi! Ready to work out a railway PVC bill?\n\n` +
        `Send /pvc and then just attach two PDFs — your agreement and your running bill. ` +
        `The PVC amount is <b>free</b>, in minutes, no login.`
      );
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const { chatId } = await req.json();
    if (!chatId) return NextResponse.json({ error: 'chatId is required' }, { status: 400 });

    const conv = await prisma.telegramConversation.findUnique({ where: { chatId: String(chatId) } });
    if (!conv) return NextResponse.json({ error: 'Chat not found' }, { status: 404 });

    const data = (conv.conversationData as any) || {};
    const last = data.adminNudgeAt ? Date.parse(data.adminNudgeAt) : 0;
    if (last && Date.now() - last < NUDGE_COOLDOWN_MS) {
      const hoursLeft = Math.ceil((NUDGE_COOLDOWN_MS - (Date.now() - last)) / 3600000);
      return NextResponse.json(
        { sent: false, error: `Already nudged in the last 24h — try again in ~${hoursLeft}h.` },
        { status: 429 },
      );
    }

    const text = nudgeText(conv.currentStep, data);
    const result = await sendTelegramMessage(String(chatId), text);
    if (!result?.ok) {
      // Most common cause: the user blocked the bot.
      return NextResponse.json(
        { sent: false, error: `Telegram rejected the message: ${result?.description || 'unknown'} (user may have blocked the bot).` },
        { status: 502 },
      );
    }

    await prisma.telegramConversation.update({
      where: { id: conv.id },
      data: { conversationData: { ...data, adminNudgeAt: new Date().toISOString() } as any },
    });

    return NextResponse.json({ sent: true, message: `Nudge sent to ${chatId}.` });
  } catch (error: any) {
    console.error('telegram-nudge error:', error);
    return NextResponse.json({ error: error?.message || 'Nudge failed' }, { status: 500 });
  }
}
