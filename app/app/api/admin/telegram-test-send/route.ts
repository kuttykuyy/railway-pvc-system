/**
 * Admin-only test of Telegram document delivery.
 *
 * GET /api/admin/telegram-test-send?chatId=123456789
 *
 * Generates a tiny PDF and sends it to the given chat with the SAME function the
 * report uses (sendTelegramDocumentBytes). This isolates "can the bot deliver a PDF
 * to this chat" from the heavy report build, and returns the real Telegram result
 * (or error) so a delivery problem is visible immediately.
 *
 * The chat id can be read from /admin/telegram. The chat must have messaged the bot
 * at least once (Telegram won't let a bot message a chat that never started it).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { sendTelegramDocumentBytes } from '@/lib/telegram-api';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const admin = await prisma.user.findUnique({ where: { email: session.user.email }, select: { role: true } });
    if (admin?.role !== 'admin' && admin?.role !== 'superadmin') {
      return NextResponse.json({ error: 'Access denied. Admin only.' }, { status: 403 });
    }

    const chatId = req.nextUrl.searchParams.get('chatId');
    if (!chatId) return NextResponse.json({ error: 'Pass ?chatId=... (find it on /admin/telegram)' }, { status: 400 });

    // Build a tiny one-page PDF.
    const { default: jsPDF } = await import('jspdf');
    const pdf = new jsPDF();
    pdf.setFontSize(16);
    pdf.text('IR-PVC — Telegram delivery test', 20, 30);
    pdf.setFontSize(11);
    pdf.text('If you received this PDF in the chat, document delivery works.', 20, 45);
    pdf.text(new Date().toISOString(), 20, 55);
    const buf = Buffer.from(pdf.output('arraybuffer'));

    try {
      const result = await sendTelegramDocumentBytes(chatId, buf, 'irpvc-test.pdf', '✅ Telegram delivery test');
      return NextResponse.json({ ok: true, sizeKB: Math.round(buf.length / 1024), result });
    } catch (err: any) {
      // sendTelegramDocumentBytes throws with Telegram's description on failure.
      return NextResponse.json({ ok: false, sizeKB: Math.round(buf.length / 1024), error: err?.message || String(err) }, { status: 502 });
    }
  } catch (error: any) {
    console.error('telegram-test-send error:', error);
    return NextResponse.json({ error: error?.message || 'Failed' }, { status: 500 });
  }
}
