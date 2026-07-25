/**
 * Admin-only Telegram bot usage stats.
 *
 * Every chat with the bot has one TelegramConversation row, so that table is the
 * usage ledger. Contracts owned by the shared guest account are a good proxy for
 * "PVC flows started from Telegram".
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getTelegramGuestUserId } from '@/lib/telegram-guest';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const admin = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { role: true },
    });
    if (admin?.role !== 'admin' && admin?.role !== 'superadmin') {
      return NextResponse.json({ error: 'Access denied. Admin only.' }, { status: 403 });
    }

    const now = Date.now();
    const since24h = new Date(now - 24 * 60 * 60 * 1000);
    const since7d = new Date(now - 7 * 24 * 60 * 60 * 1000);

    const guestUserId = await getTelegramGuestUserId();

    const [totalChats, linkedChats, active24h, active7d, guestContracts, guestContracts7d, guestBills, guestBills7d] =
      await Promise.all([
        prisma.telegramConversation.count(),
        prisma.telegramConversation.count({ where: { userId: { not: null } } }),
        prisma.telegramConversation.count({ where: { lastMessageAt: { gte: since24h } } }),
        prisma.telegramConversation.count({ where: { lastMessageAt: { gte: since7d } } }),
        prisma.contract.count({ where: { userId: guestUserId } }),
        prisma.contract.count({ where: { userId: guestUserId, createdAt: { gte: since7d } } }),
        prisma.bill.count({ where: { contract: { userId: guestUserId } } }),
        prisma.bill.count({ where: { contract: { userId: guestUserId }, createdAt: { gte: since7d } } }),
      ]);

    // Most recent chats — small page for the activity table.
    const rows = await prisma.telegramConversation.findMany({
      orderBy: { lastMessageAt: 'desc' },
      take: 50,
      include: { user: { select: { name: true, email: true, phone: true } } },
    });

    let awaitingPayment = 0;
    const recent = rows.map((r) => {
      const d = (r.conversationData as any) || {};
      const pendingReport = !!d.docPendingReport;
      if (pendingReport) awaitingPayment++;
      return {
        chatId: r.chatId,
        step: r.currentStep,
        lastMessageAt: r.lastMessageAt,
        linked: !!r.userId,
        account: r.user ? (r.user.name || r.user.email || r.user.phone || null) : null,
        agreementNo: d.docContractAgreementNo || null,
        awaitingPayment: pendingReport,
      };
    });

    return NextResponse.json({
      stats: {
        totalChats,
        linkedChats,
        guestChats: totalChats - linkedChats,
        active24h,
        active7d,
        pvcContracts: guestContracts,
        pvcContracts7d: guestContracts7d,
        pvcBills: guestBills,
        pvcBills7d: guestBills7d,
        awaitingPayment,
      },
      recent,
    });
  } catch (error: any) {
    console.error('telegram-usage error:', error);
    return NextResponse.json({ error: error.message || 'Failed to load usage' }, { status: 500 });
  }
}
