/**
 * Nudges — follow-up messages to Telegram chats that stalled mid-PVC-flow.
 *
 * Used two ways:
 *   - manually, from the /admin/telegram page (one button per chat)
 *   - automatically, by the daily cron (app/api/cron/telegram-nudge)
 *
 * Restraint rules live here so both paths share them:
 *   - any nudge (manual or auto) at most once per 24h per chat
 *   - automatic nudges stop after MAX_AUTO_NUDGES per chat — after that, only a
 *     human clicking the button can follow up. Nobody gets pestered forever.
 */

import { prisma } from './db';
import { sendTelegramMessage } from './telegram-api';

export const NUDGE_COOLDOWN_MS = 24 * 60 * 60 * 1000;
export const MAX_AUTO_NUDGES = 2;

/** Steps that mean "mid-flow, waiting on the user" — worth following up. */
export const NUDGEABLE_STEPS = [
  'AWAITING_AGREEMENT_PDF',
  'AWAITING_BILL_PDF',
  'AWAITING_ZONE',
  'AWAITING_TENDER_DATE',
];

/** Strip the internal per-chat namespace suffix for display. */
function displayAgreementNo(stored: string | null | undefined): string {
  return String(stored || '').replace(/\s*·\s*tg:\S+$/i, '').trim();
}

/** The message that fits where this chat stopped. */
export function nudgeText(step: string, data: any): string {
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

export interface NudgeResult {
  sent: boolean;
  reason?: string;
}

/**
 * Sends a nudge to one conversation, honouring the shared cooldown.
 * @param auto true when called by the cron — also enforces MAX_AUTO_NUDGES and
 *             increments the auto counter.
 */
export async function sendNudge(conv: { id: string; chatId: string; currentStep: string; conversationData: any }, auto: boolean): Promise<NudgeResult> {
  const data = (conv.conversationData as any) || {};

  const lastNudge = Math.max(
    data.adminNudgeAt ? Date.parse(data.adminNudgeAt) : 0,
    data.autoNudgeAt ? Date.parse(data.autoNudgeAt) : 0,
  );
  if (lastNudge && Date.now() - lastNudge < NUDGE_COOLDOWN_MS) {
    const hoursLeft = Math.ceil((NUDGE_COOLDOWN_MS - (Date.now() - lastNudge)) / 3600000);
    return { sent: false, reason: `Already nudged in the last 24h — try again in ~${hoursLeft}h.` };
  }
  if (auto && (data.autoNudgeCount || 0) >= MAX_AUTO_NUDGES) {
    return { sent: false, reason: 'Auto-nudge limit reached for this chat.' };
  }

  const result = await sendTelegramMessage(conv.chatId, nudgeText(conv.currentStep, data));
  if (!result?.ok) {
    return { sent: false, reason: `Telegram rejected the message: ${result?.description || 'unknown'} (user may have blocked the bot).` };
  }

  const stamp = new Date().toISOString();
  const patch = auto
    ? { autoNudgeAt: stamp, autoNudgeCount: (data.autoNudgeCount || 0) + 1 }
    : { adminNudgeAt: stamp };
  await prisma.telegramConversation.update({
    where: { id: conv.id },
    data: { conversationData: { ...data, ...patch } as any },
  });

  return { sent: true };
}
