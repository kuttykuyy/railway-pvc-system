/**
 * Hourly cron: follow up on payments people started and did not finish.
 *
 * Two queues, one run:
 *  - Web intents (payment_intents): a bill blocked at "insufficient credits", or a
 *    Razorpay top-up opened and never paid. Reminded by email (and Telegram if the
 *    account is linked) ~2h after the intent, and once more ~24h after. An intent is
 *    resolved silently the moment any credit is added to that account after it.
 *  - Telegram report links (conversationData.docPendingReport): the ~2h arm only.
 *    The 24h arm is the existing daily telegram-nudge, which already covers unpaid
 *    reports with its own cooldown and cap.
 *
 * Off with the ABANDONED_PAYMENT_REMINDER_ENABLED admin setting. Never more than
 * MAX_PER_RUN messages per run. `?dryRun=1` reports what it would send.
 *
 * Auth: Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}`; `?secret=` is also
 * accepted for a manual trigger. Fails closed if CRON_SECRET is unset.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { schemaQualified } from '@/lib/db-schema';
import { getAdminSetting, getBillingSettings } from '@/lib/admin-settings';
import { getBillPacks } from '@/lib/bill-packs';
import { reminderCopy, paymentReminderHtml, type PaymentIntentKind } from '@/lib/payment-intent';
import { sendTelegramMessage, notifyTelegramAdmin } from '@/lib/telegram-api';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const MAX_PER_RUN = 30;
const HOUR = 60 * 60 * 1000;
const FIRST_AFTER_MS = 2 * HOUR;
const SECOND_AFTER_MS = 24 * HOUR;
/** Older than this and the moment has passed — close it without a message. */
const STALE_AFTER_MS = 7 * 24 * HOUR;
const APP_URL = 'https://irpvc.in';

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  if (request.headers.get('authorization') === `Bearer ${secret}`) return true;
  return request.nextUrl.searchParams.get('secret') === secret;
}

interface IntentRow {
  id: number;
  userId: string;
  userEmail: string | null;
  kind: PaymentIntentKind;
  amount: number;
  context: string | null;
  createdAt: Date;
  reminder1At: Date | null;
  reminder2At: Date | null;
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const dryRun = request.nextUrl.searchParams.get('dryRun') === '1';

  try {
    const enabled = await getAdminSetting('ABANDONED_PAYMENT_REMINDER_ENABLED', true);
    if (!enabled) {
      return NextResponse.json({ skipped: 'ABANDONED_PAYMENT_REMINDER_ENABLED is off' });
    }

    const now = Date.now();
    const { billCost } = await getBillingSettings();
    const smallestPack = (await getBillPacks()).filter(p => !p.ai).sort((a, b) => a.bills - b.bills)[0];
    const summary = { web: { due: 0, resolved: 0, stale: 0, sent: 0, failed: 0 }, telegram: { due: 0, sent: 0 } };
    const sentTo: string[] = [];
    let budget = MAX_PER_RUN;

    // ---------- Web intents ----------
    const table = await schemaQualified('payment_intents').catch(() => null);
    if (table) {
      const due = await prisma.$queryRawUnsafe<IntentRow[]>(
        `SELECT id, "userId", "userEmail", kind, amount, context, "createdAt", "reminder1At", "reminder2At"
           FROM ${table}
          WHERE "resolvedAt" IS NULL
            AND (
              ("reminder1At" IS NULL AND "createdAt" < $1)
              OR ("reminder1At" IS NOT NULL AND "reminder2At" IS NULL AND "createdAt" < $2)
            )
          ORDER BY "createdAt" ASC
          LIMIT 200`,
        new Date(now - FIRST_AFTER_MS),
        new Date(now - SECOND_AFTER_MS),
      );
      summary.web.due = due.length;

      // One message per person per run: the newest intent speaks for all of theirs.
      const newestByUser = new Map<string, IntentRow>();
      for (const row of due) {
        const prev = newestByUser.get(row.userId);
        if (!prev || row.createdAt > prev.createdAt) newestByUser.set(row.userId, row);
      }

      for (const row of newestByUser.values()) {
        const age = now - new Date(row.createdAt).getTime();
        const arm: 1 | 2 = row.reminder1At ? 2 : 1;

        // Paid since? Then it is done — close every open intent of theirs, say nothing.
        const paidSince = await prisma.creditTransaction.findFirst({
          where: { userId: row.userId, type: 'add', createdAt: { gt: new Date(row.createdAt) } },
          select: { id: true },
        });
        if (paidSince) {
          summary.web.resolved++;
          if (!dryRun) await prisma.$executeRawUnsafe(`UPDATE ${table} SET "resolvedAt" = NOW() WHERE "userId" = $1 AND "resolvedAt" IS NULL`, row.userId);
          continue;
        }
        if (age > STALE_AFTER_MS) {
          summary.web.stale++;
          if (!dryRun) await prisma.$executeRawUnsafe(`UPDATE ${table} SET "resolvedAt" = NOW() WHERE "userId" = $1 AND "resolvedAt" IS NULL`, row.userId);
          continue;
        }
        if (budget <= 0) break;

        const user = await prisma.user.findUnique({ where: { id: row.userId }, select: { email: true, name: true } });
        const email = user?.email || row.userEmail;
        if (!email) continue;

        const copy = reminderCopy({
          kind: row.kind, amount: row.amount, context: row.context, arm, billCost,
          packBills: smallestPack?.bills, packPrice: smallestPack?.price,
        });
        const url = row.kind === 'bill_blocked' ? `${APP_URL}/bills/new` : `${APP_URL}/profile`;

        if (dryRun) { sentTo.push(`${email} (web arm ${arm})`); budget--; continue; }

        let delivered = false;
        try {
          const { resend } = await import('@/lib/resend');
          const { error } = await resend.emails.send({
            from: 'IR-PVC <noreply@irpvc.in>',
            to: email,
            subject: copy.subject,
            html: paymentReminderHtml(copy, url),
          });
          if (error) throw new Error(typeof error === 'string' ? error : (error as any).message || 'send failed');
          delivered = true;
        } catch (err) {
          console.error(`[cron/payment-reminder] email to ${email} failed:`, err);
        }

        // A linked Telegram chat gets the same nudge — it is where they will see it first.
        const linked = await prisma.telegramConversation.findFirst({ where: { userId: row.userId }, select: { chatId: true } });
        if (linked) {
          try {
            const tg = await sendTelegramMessage(
              linked.chatId,
              `💳 <b>${copy.headline}</b>\n\n${copy.body}\n\n${copy.cta}: ${url}`,
            );
            if (tg?.ok) delivered = true;
          } catch (err) {
            console.error(`[cron/payment-reminder] telegram to ${linked.chatId} failed:`, err);
          }
        }

        if (delivered) {
          summary.web.sent++;
          sentTo.push(`${email} (arm ${arm})`);
          budget--;
          // Stamp every open intent of theirs so a second one does not re-send tonight;
          // after the second arm the intent is closed for good.
          await prisma.$executeRawUnsafe(
            arm === 1
              ? `UPDATE ${table} SET "reminder1At" = NOW() WHERE "userId" = $1 AND "resolvedAt" IS NULL AND "reminder1At" IS NULL`
              : `UPDATE ${table} SET "reminder2At" = NOW(), "resolvedAt" = NOW() WHERE "userId" = $1 AND "resolvedAt" IS NULL`,
            row.userId,
          );
        } else {
          summary.web.failed++;
        }
      }
    }

    // ---------- Telegram report links: the 2h arm ----------
    const quietSince = new Date(now - FIRST_AFTER_MS);
    const chats = await prisma.telegramConversation.findMany({
      where: { lastMessageAt: { lt: quietSince } },
      orderBy: { lastMessageAt: 'desc' },
      take: 200,
    });
    for (const conv of chats) {
      if (budget <= 0) break;
      const data = (conv.conversationData as any) || {};
      if (!data.docPendingReport || data.payReminder2hAt) continue;
      const offeredAt = data.docPendingReportOfferedAt ? Date.parse(data.docPendingReportOfferedAt) : NaN;
      // Only links offered since this feature exists carry a time; older ones are
      // the daily nudge's business.
      if (!Number.isFinite(offeredAt) || now - offeredAt < FIRST_AFTER_MS || now - offeredAt > SECOND_AFTER_MS) continue;
      summary.telegram.due++;
      if (dryRun) { sentTo.push(`tg:${conv.chatId}`); budget--; continue; }

      const link = data.docPendingPaymentUrl ? `\n\n💳 Pay here: ${data.docPendingPaymentUrl}` : `\n\n💳 The payment link is in the messages above.`;
      const tg = await sendTelegramMessage(
        conv.chatId,
        `👋 Your PVC statement is calculated and waiting.${link}\n\nPay by UPI/card and the PDF arrives here instantly. Already paid? Send /paid.`,
      ).catch(() => null);
      if (tg?.ok) {
        summary.telegram.sent++;
        sentTo.push(`tg:${conv.chatId}`);
        budget--;
        await prisma.telegramConversation.update({
          where: { id: conv.id },
          data: { conversationData: { ...data, payReminder2hAt: new Date().toISOString() } },
        });
      }
    }

    const total = summary.web.sent + summary.telegram.sent;
    if (total > 0 && !dryRun) {
      notifyTelegramAdmin(
        `💸 <b>Payment reminders</b>\n\nSent ${total} reminder(s):\n` + sentTo.map(s => `• ${s}`).join('\n'),
      ).catch(() => {});
    }
    console.log('[cron/payment-reminder]', JSON.stringify({ dryRun, ...summary }));
    return NextResponse.json({ dryRun, ...summary, sentTo: dryRun ? sentTo : undefined });
  } catch (error: any) {
    console.error('[cron/payment-reminder] failed:', error);
    return NextResponse.json({ error: error?.message || 'Cron failed' }, { status: 500 });
  }
}
