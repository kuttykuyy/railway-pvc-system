/**
 * Nightly cleanup: the one job that stops eleven tables growing forever.
 *
 * Every other cron here imports something; nothing ever removed anything. Expired OTPs,
 * dead sessions, spent verification tokens, closed rate-limit windows and old message
 * logs all accumulated from the first day, and were deleted only when an entire user
 * account was deleted.
 *
 * Two rules this job holds to:
 *
 *   1. It only deletes rows that are spent — an OTP past its expiry, a session past
 *      its own `expires`, a rate-limit window already closed. Nothing here decides that
 *      live data is old enough to lose.
 *
 *   2. It does NOT delete the WhatsApp and Telegram conversation rows. Those carry the
 *      link between a phone number or chat and its user account (`userId`), one row per
 *      chat, so they grow with people rather than with traffic — and deleting one signs
 *      that person out of the bot. (lib/whatsapp-conversation.ts has a written
 *      seven-day cleanup that does exactly that; it is called from nowhere, and it
 *      should stay that way.) What genuinely goes stale is the half-finished flow
 *      state on those rows, so idle conversations are RESET to IDLE with their scratch
 *      data cleared, and only never-linked rows are removed.
 *
 * Auth: Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}`. A manual trigger with
 * `?secret=<CRON_SECRET>` also works. Fails closed if CRON_SECRET is unset.
 *
 * `?dryRun=1` counts what would go without deleting anything — worth running first.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/** How long each kind of spent row is kept. Days. */
const KEEP = {
  /** Expired one-time passwords. Kept a day for support questions ("it said invalid"). */
  otps: 1,
  /** Sessions and email tokens: deleted once past their own expiry, plus a day's grace. */
  authGrace: 1,
  /** Closed rate-limit windows. Nothing reads a window that has ended. */
  rateLimitWindows: 1,
  /** Expired PVC comparison sessions. */
  comparisonSessions: 7,
  /** Per-user daily comparison counters — only today's is ever read. */
  comparisonCounters: 90,
  /** WhatsApp message log. Long enough to investigate a delivery complaint. */
  whatsappLogs: 90,
  /** AI call log. This is the usage record behind the admin page, so it is kept a year. */
  aiUsage: 365,
  /** A conversation sitting mid-flow this long is abandoned; reset it, keep the link. */
  conversationFlowState: 7,
  /** A conversation never linked to an account and silent this long is just noise. */
  unlinkedConversations: 60,
} as const;

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // fail closed — no secret configured, no access
  const header = request.headers.get('authorization');
  if (header === `Bearer ${secret}`) return true;
  if (request.nextUrl.searchParams.get('secret') === secret) return true;
  return false;
}

const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000);

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const dryRun = request.nextUrl.searchParams.get('dryRun') === '1';
  const startedAt = Date.now();
  const removed: Record<string, number> = {};
  const failed: Record<string, string> = {};

  /**
   * Each table is swept on its own and its failure is recorded rather than thrown: one
   * unapplied table or one locked row must not stop the other ten from being cleaned.
   */
  const sweep = async (
    name: string,
    count: () => Promise<number>,
    remove: () => Promise<{ count: number }>,
  ) => {
    try {
      removed[name] = dryRun ? await count() : (await remove()).count;
    } catch (error: any) {
      failed[name] = error?.message || 'failed';
    }
  };

  // ── Spent authentication rows ────────────────────────────────────────────────
  const otpCutoff = daysAgo(KEEP.otps);
  await sweep('phone_otps',
    () => prisma.phoneOtp.count({ where: { expiresAt: { lt: otpCutoff } } }),
    () => prisma.phoneOtp.deleteMany({ where: { expiresAt: { lt: otpCutoff } } }));

  const authCutoff = daysAgo(KEEP.authGrace);
  await sweep('sessions',
    () => prisma.session.count({ where: { expires: { lt: authCutoff } } }),
    () => prisma.session.deleteMany({ where: { expires: { lt: authCutoff } } }));

  await sweep('verification_tokens',
    () => prisma.verificationToken.count({ where: { expires: { lt: authCutoff } } }),
    () => prisma.verificationToken.deleteMany({ where: { expires: { lt: authCutoff } } }));

  // ── Rate limiting ────────────────────────────────────────────────────────────
  // Written on every signup, sign-in and webhook call; nothing ever removed a window.
  const windowCutoff = daysAgo(KEEP.rateLimitWindows);
  await sweep('rate_limits',
    () => prisma.rateLimit.count({ where: { windowEnd: { lt: windowCutoff } } }),
    () => prisma.rateLimit.deleteMany({ where: { windowEnd: { lt: windowCutoff } } }));

  // ── PVC comparison ───────────────────────────────────────────────────────────
  const comparisonCutoff = daysAgo(KEEP.comparisonSessions);
  await sweep('pvc_comparison_sessions',
    () => prisma.pvcComparisonSession.count({ where: { expiresAt: { lt: comparisonCutoff } } }),
    () => prisma.pvcComparisonSession.deleteMany({ where: { expiresAt: { lt: comparisonCutoff } } }));

  const counterCutoff = daysAgo(KEEP.comparisonCounters);
  await sweep('pvc_comparison_daily_usage',
    () => prisma.pvcComparisonDailyUsage.count({ where: { date: { lt: counterCutoff } } }),
    () => prisma.pvcComparisonDailyUsage.deleteMany({ where: { date: { lt: counterCutoff } } }));

  // ── Logs ─────────────────────────────────────────────────────────────────────
  const whatsappCutoff = daysAgo(KEEP.whatsappLogs);
  await sweep('whatsapp_logs',
    () => prisma.whatsAppLog.count({ where: { sentAt: { lt: whatsappCutoff } } }),
    () => prisma.whatsAppLog.deleteMany({ where: { sentAt: { lt: whatsappCutoff } } }));

  const aiCutoff = daysAgo(KEEP.aiUsage);
  await sweep('ai_usage_logs',
    () => prisma.aiUsageLog.count({ where: { createdAt: { lt: aiCutoff } } }),
    () => prisma.aiUsageLog.deleteMany({ where: { createdAt: { lt: aiCutoff } } }));

  // ── Conversations: reset the flow, keep the person ───────────────────────────
  // Not deletions. A row here is one chat and carries its userId; removing it would
  // sign that person out of the bot. Only the abandoned half-finished flow is cleared.
  const staleFlow = daysAgo(KEEP.conversationFlowState);
  const resetData = { currentStep: 'IDLE', conversationData: {}, expiresAt: null };
  const stuckWhere = { lastMessageAt: { lt: staleFlow }, currentStep: { not: 'IDLE' } };

  await sweep('whatsapp_conversations_reset',
    () => prisma.whatsAppConversation.count({ where: stuckWhere }),
    () => prisma.whatsAppConversation.updateMany({ where: stuckWhere, data: resetData }));

  await sweep('telegram_conversations_reset',
    () => prisma.telegramConversation.count({ where: stuckWhere }),
    () => prisma.telegramConversation.updateMany({ where: stuckWhere, data: resetData }));

  // A chat that never signed in and has been silent for two months is nobody's session.
  const unlinkedCutoff = daysAgo(KEEP.unlinkedConversations);
  const unlinkedWhere = { userId: null, lastMessageAt: { lt: unlinkedCutoff } };

  await sweep('whatsapp_conversations_unlinked',
    () => prisma.whatsAppConversation.count({ where: unlinkedWhere }),
    () => prisma.whatsAppConversation.deleteMany({ where: unlinkedWhere }));

  await sweep('telegram_conversations_unlinked',
    () => prisma.telegramConversation.count({ where: unlinkedWhere }),
    () => prisma.telegramConversation.deleteMany({ where: unlinkedWhere }));

  const total = Object.values(removed).reduce((sum, n) => sum + n, 0);
  const durationMs = Date.now() - startedAt;
  const summary = { dryRun, total, durationMs, removed, ...(Object.keys(failed).length ? { failed } : {}) };

  if (!dryRun && total > 0) {
    console.info('[cron/cleanup]', JSON.stringify(summary));
  }
  if (Object.keys(failed).length > 0) {
    console.error('[cron/cleanup] some tables could not be swept', failed);
  }

  return NextResponse.json(summary);
}
