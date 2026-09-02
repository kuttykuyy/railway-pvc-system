/**
 * Telegram document (PDF) flow — "upload the agreement + the bill, get your PVC".
 *
 * The user sends two PDFs to the bot. Each arrives as its own Telegram document
 * update, so we handle them one at a time:
 *   1. Download the PDF bytes.
 *   2. Decide whether it is the AGREEMENT or the BILL (the agreement extractor
 *      returns an agreement number for an agreement, and mostly nulls for a bill).
 *   3. Agreement → find-or-create the contract (with its schedules/rates).
 *      Bill      → remember its file_id for the PVC step.
 *   4. Once BOTH are in hand, run the bill extraction + PVC and reply in chat.
 *
 * "No login" design: bills are parked under a shared guest account unless the
 * chat is already linked to a real user by phone. See telegram-guest.ts.
 */

import { prisma } from './db';
import {
  getOrCreateTelegramConversation,
  updateTelegramConversation,
  mutateTelegramConversationData,
  getTelegramConversationData,
  TelegramStep,
} from './telegram-conversation';
import { sendTelegramMessage, sendTelegramChatAction, downloadTelegramFile, inlineKeyboard, notifyTelegramAdmin } from './telegram-api';
import { getRailwayZoneOptions } from './zone-steel-city-mapping';
import { extractAgreementFromPdf, type ExtractedAgreement } from './ai/agreement-extractor';
import { getTelegramGuestUserId } from './telegram-guest';
import { getBaseMonth } from './pvc-calculations';
import type { ContractSchedule } from './contract-schedules';
import { processUploadedBillPvc } from './telegram-bill-pvc';

export interface TelegramDocument {
  file_id: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
}

const MAX_PDF_BYTES = 25 * 1024 * 1024; // matches the bill extractor's 25MB cap

// How many bills can sit waiting for the agreement (or the zone/fuel answers) at once.
// A contractor catching up on a year's billing sends a handful; beyond this the oldest
// are dropped rather than kept forever.
const MAX_QUEUED_BILLS = 10;

// Combined payment links kept per chat. Each /payall supersedes the last, but a few
// are retained so a link created a moment ago still works if the user pays it late.
const MAX_BUNDLE_LINKS = 5;

// Each PDF triggers AI extraction (cost), so cap how many a chat can send per day.
// Guests are anonymous; linked accounts get a higher allowance. Override via env.
const GUEST_DAILY_PDF_LIMIT = Number(process.env.TELEGRAM_GUEST_DAILY_PDFS || 10);
const LINKED_DAILY_PDF_LIMIT = Number(process.env.TELEGRAM_LINKED_DAILY_PDFS || 40);

function istDateKey(): string {
  // Day boundary in IST so "per day" matches the user's calendar.
  const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  return ist.toISOString().slice(0, 10);
}

/**
 * Increments the chat's per-day PDF counter and reports whether it's within the cap.
 * Resets automatically when the (IST) date rolls over.
 */
async function bumpDailyPdfCount(conversation: any, limit: number): Promise<{ allowed: boolean; remaining: number }> {
  const today = istDateKey();
  const data = getTelegramConversationData(conversation);
  const usage = data.dailyUsage && data.dailyUsage.date === today
    ? { date: today, pdfs: data.dailyUsage.pdfs + 1 }
    : { date: today, pdfs: 1 };
  await updateTelegramConversation(conversation.id, conversation.currentStep, { dailyUsage: usage });
  return { allowed: usage.pdfs <= limit, remaining: Math.max(0, limit - usage.pdfs) };
}

/**
 * Entry point from the webhook for an incoming document message.
 */
export async function handleTelegramDocument(chatId: string, doc: TelegramDocument) {
  const conversation = await getOrCreateTelegramConversation(chatId);

  const isPdf =
    doc.mime_type === 'application/pdf' || /\.pdf$/i.test(doc.file_name || '');
  if (!isPdf) {
    return sendTelegramMessage(
      chatId,
      '📎 Please send a <b>PDF</b> file. I need the tender <b>agreement</b> PDF and the <b>running bill</b> PDF to work out the PVC.',
    );
  }
  if (doc.file_size && doc.file_size > MAX_PDF_BYTES) {
    return sendTelegramMessage(chatId, '❌ That PDF is too large (max 25 MB). Please send a smaller file.');
  }

  // Rate limit: cap AI-extraction cost per chat per day.
  const limit = conversation.userId ? LINKED_DAILY_PDF_LIMIT : GUEST_DAILY_PDF_LIMIT;
  const { allowed } = await bumpDailyPdfCount(conversation, limit);
  if (!allowed) {
    return sendTelegramMessage(
      chatId,
      `⏳ You've reached today's limit of <b>${limit} PDFs</b> on this chat.\n\n` +
        `Please try again tomorrow` +
        (conversation.userId ? '.' : ', or sign up on irpvc.in for a higher limit.'),
    );
  }

  await sendTelegramChatAction(chatId, 'typing');

  let bytes: Buffer;
  try {
    bytes = await downloadTelegramFile(doc.file_id);
  } catch (err) {
    console.error('[Telegram] file download failed:', err);
    return sendTelegramMessage(chatId, '❌ I could not download that file from Telegram. Please try sending it again.');
  }

  // Classify: is this the agreement or the bill? The agreement extractor gives an
  // agreement number for an agreement and mostly nulls for a running bill.
  await sendTelegramMessage(chatId, `📄 Reading <b>${escapeHtml(doc.file_name || 'your PDF')}</b>…`);
  const extraction = await extractAgreementFromPdf(bytes, doc.file_name || 'document.pdf');

  // Classify by the AI's documentType — NOT just "has an agreement number", because
  // a running bill also prints the agreement number and was being misread as the
  // agreement. Only treat it as the agreement when the model says so AND it carries a
  // number; anything else (bill / other) is handled as the bill PDF.
  //
  // An LOA counts: the agreement is signed weeks after the work is awarded, so a
  // contractor billing early may only have the Letter of Acceptance. It names the
  // work, the contractor and the accepted value, which is what the contract needs —
  // so accept an LOA number when there is no agreement number yet.
  const data = extraction.ok ? extraction.data ?? null : null;
  const looksLikeAgreement =
    !!data && data.documentType === 'agreement' && !!(nonEmpty(data.agreementNo) || nonEmpty(data.loaNo));

  if (looksLikeAgreement) {
    return handleAgreementDoc(conversation.id, chatId, data, doc);
  }

  // Not an agreement → treat as the bill PDF. Keep its file_id for the PVC step.
  return handleBillDoc(conversation.id, chatId, doc);
}

async function handleAgreementDoc(
  conversationId: string,
  chatId: string,
  data: ExtractedAgreement | null,
  _doc: TelegramDocument,
) {
  if (!data) {
    return sendTelegramMessage(chatId, '❌ I could not read the agreement clearly. Please try a clearer PDF.');
  }
  // The base month is derived from the tender closing date, so without a date we
  // cannot compute PVC. Never guess (defaulting to "today" produced a 2026 base
  // month and a Q0/zero PVC) — ask the user instead.
  const isLoaOnly = !nonEmpty(data.agreementNo) && nonEmpty(data.loaNo);
  if (!agreementOpeningDate(data)) {
    await updateTelegramConversation(conversationId, TelegramStep.AWAITING_TENDER_DATE, {
      docPendingAgreement: data,
    });
    return sendTelegramMessage(
      chatId,
      `📄 I read the ${isLoaOnly ? 'LOA' : 'agreement'} <b>${escapeHtml(String(data.agreementNo || data.loaNo || ''))}</b>, but I couldn't find the <b>tender closing date</b> in it.\n\n` +
        `That date sets the PVC base month, so I need it. Please reply with it in <b>DD/MM/YYYY</b> format (e.g. 15/03/2024):`,
    );
  }
  try {
    const contract = await findOrCreateContractFromAgreement(conversationId, data);
    await updateTelegramConversation(conversationId, TelegramStep.AWAITING_ZONE, {
      docContractId: contract.id,
      docContractAgreementNo: displayAgreementNo(contract.agreementNo),
    });

    await sendTelegramMessage(
      chatId,
      `✅ <b>${isLoaOnly ? 'LOA' : 'Agreement'} read</b>\n\n` +
        (isLoaOnly
          ? `📄 LOA No: <b>${escapeHtml(String(data.loaNo || ''))}</b>\n<i>I'll pick up the agreement number from your bill.</i>\n`
          : `📄 Agreement No: <b>${escapeHtml(displayAgreementNo(contract.agreementNo))}</b>\n`) +
        (contract.contractorName ? `👤 Contractor: <b>${escapeHtml(contract.contractorName)}</b>\n` : '') +
        (contract.workDescription ? `🏗️ Work: <b>${escapeHtml(truncate(contract.workDescription, 80))}</b>\n` : ''),
    );

    // The railway zone decides which steel indices (and the zone-city fuel index)
    // apply, so confirm it before the bill — guessing it would skew the PVC.
    return askZone(conversationId, chatId, data.railwayName || null);
  } catch (err: any) {
    console.error('[Telegram] contract create failed:', err);
    return sendTelegramMessage(chatId, `❌ Could not set up the contract: ${escapeHtml(err.message || 'unknown error')}`);
  }
}

async function handleBillDoc(conversationId: string, chatId: string, doc: TelegramDocument) {
  const conv0 = await prisma.telegramConversation.findUnique({ where: { id: conversationId } });
  const stored0 = getTelegramConversationData(conv0);
  const haveContract = !!stored0.docContractId;
  const answeredQuestions = !!stored0.docZone && !!stored0.docFuelPriceType;

  // Ready to price → run THIS bill straight from the file id on the message that
  // carried it. Nothing goes through a shared slot, so a user who forwards five
  // running bills at once gets five PVCs instead of whichever landed last.
  if (haveContract && answeredQuestions) {
    await sendTelegramMessage(chatId, `✅ <b>Bill received.</b> Calculating your PVC…`);
    return processOneBill(conversationId, chatId, {
      fileId: doc.file_id,
      fileName: doc.file_name || 'bill.pdf',
    });
  }

  // Not ready yet: queue the bill behind whatever is still missing.
  const queued = await queuePendingBill(conversationId, {
    fileId: doc.file_id,
    fileName: doc.file_name || 'bill.pdf',
  }, haveContract ? undefined : TelegramStep.AWAITING_AGREEMENT_PDF);

  const waiting = queued > 1 ? ` (${queued} bills waiting)` : '';
  if (haveContract) {
    return sendTelegramMessage(chatId, `✅ <b>Bill received</b>${waiting} — I'll keep it. Please answer the question above first.`);
  }
  return sendTelegramMessage(
    chatId,
    `✅ <b>Bill received</b>${waiting} — I'll keep it.\n\n` +
      `📎 <b>Now send the tender agreement PDF</b> (or the <b>LOA</b> if the agreement isn't signed yet) — I need it for the schedules, rates and base month, and then I'll calculate the PVC.`,
  );
}

/** Adds a bill to the waiting queue and reports how many are now waiting. */
async function queuePendingBill(
  conversationId: string,
  bill: { fileId: string; fileName: string },
  step?: TelegramStep,
): Promise<number> {
  const next = await mutateTelegramConversationData(
    conversationId,
    (current) => {
      const pending = [...(current.docPendingBills || []), bill];
      return {
        ...current,
        // Cap it: each bill costs an extraction, and nobody sends 20 by accident.
        docPendingBills: pending.slice(-MAX_QUEUED_BILLS),
        // The legacy single slot keeps older code paths (and /paid resumes) working.
        docBillFileId: bill.fileId,
        docBillFileName: bill.fileName,
      };
    },
    step,
  );
  return (next.docPendingBills || []).length;
}

/**
 * Starts the guided two-step flow. Clears any half-finished upload so the user
 * always begins from a clean state.
 */
export async function startPvcFlow(conversationId: string, chatId: string) {
  // Alert the admin the first time a chat ever starts a PVC run, so new users are
  // visible without waiting for them to finish. No-op unless an admin id is set.
  try {
    const conv = await prisma.telegramConversation.findUnique({
      where: { id: conversationId },
      select: { createdAt: true, lastMessageAt: true },
    });
    const isNew = conv && conv.lastMessageAt.getTime() - conv.createdAt.getTime() < 60_000;
    if (isNew) {
      notifyTelegramAdmin(`👋 <b>New user started the bot</b>\n\n👤 Chat: <code>${chatId}</code>`).catch(() => {});
    }
  } catch { /* never block the flow for an alert */ }

  await updateTelegramConversation(conversationId, TelegramStep.AWAITING_AGREEMENT_PDF, {
    docContractId: undefined,
    docContractAgreementNo: undefined,
    docBillFileId: undefined,
    docBillFileName: undefined,
    docPendingBills: undefined,
    docPendingAgreement: undefined,
    docZone: undefined,
    docFuelPriceType: undefined,
    // Unpaid statements are deliberately NOT cleared. They are held against their own
    // payment links, and someone starting a second agreement should still receive the
    // statement they pay for from the first.
  });
  return sendTelegramMessage(
    chatId,
    `🚂 <b>Let's work out your PVC</b>\n\n` +
      `📎 <b>Step 1 of 2:</b> send the <b>tender agreement PDF</b>.\n` +
      `<i>No signed agreement yet? Send the <b>LOA</b> instead — that works too.</i>\n\n` +
      `Then send your <b>running bill</b>. You can send <b>several bills</b> for the same agreement and I'll price each one.\n\n` +
      `<i>Tap the 📎 clip button and choose the file. Type /cancel to stop.</i>`,
  );
}

// ─── Zone + fuel basis questions ─────────────────────

/** Best-guess zone code from the railway name printed on the agreement. */
function guessZoneCode(railwayName: string | null): string | null {
  if (!railwayName) return null;
  const needle = String(railwayName).trim().toLowerCase();
  if (!needle) return null;
  const options = getRailwayZoneOptions();
  const exact = options.find(o => o.label.toLowerCase() === needle);
  if (exact) return exact.value;
  const contains = options.find(
    o => needle.includes(o.label.toLowerCase()) || o.label.toLowerCase().includes(needle),
  );
  return contains ? contains.value : null;
}

/** Asks the user to confirm (or type) the railway zone. */
export async function askZone(conversationId: string, chatId: string, railwayName: string | null) {
  const guess = guessZoneCode(railwayName);
  await updateTelegramConversation(conversationId, TelegramStep.AWAITING_ZONE, {});

  if (guess) {
    const info = getRailwayZoneOptions().find(o => o.value === guess)!;
    return sendTelegramMessage(
      chatId,
      `🚉 <b>Railway zone</b>\n\nThe agreement looks like <b>${escapeHtml(info.label)} (${guess})</b>.\n\n` +
        `This sets the steel price indices used for the PVC. Is that right?`,
      {
        replyMarkup: inlineKeyboard([
          [{ text: `✅ Yes — ${info.label}`, callback_data: `zone_${guess}` }],
          [{ text: '✏️ No, choose another', callback_data: 'zone_other' }],
        ]),
      },
    );
  }
  return sendZoneList(chatId);
}

async function sendZoneList(chatId: string) {
  const list = getRailwayZoneOptions()
    .map(o => `<b>${o.value}</b> — ${escapeHtml(o.label)}`)
    .join('\n');
  return sendTelegramMessage(
    chatId,
    `🚉 <b>Which railway zone?</b>\n\nReply with the code (e.g. <b>SR</b>):\n\n${list}`,
  );
}

/** Handles the zone answer (button or typed code), then asks the fuel basis. */
export async function handleZoneReply(conversation: any, msg: string, chatId: string) {
  const raw = String(msg).trim();
  if (raw.toLowerCase() === 'zone_other') return sendZoneList(chatId);

  const code = raw.replace(/^zone_/i, '').toUpperCase();
  const match = getRailwayZoneOptions().find(o => o.value.toUpperCase() === code);
  if (!match) {
    return sendTelegramMessage(chatId, `❌ I don't know the zone "<b>${escapeHtml(raw)}</b>". Please reply with a code from the list (e.g. SR).`);
  }

  await updateTelegramConversation(conversation.id, TelegramStep.AWAITING_FUEL_BASIS, { docZone: match.value });
  await sendTelegramMessage(chatId, `✅ Zone: <b>${escapeHtml(match.label)}</b>`);

  // Ask the fuel basis — it must NOT be assumed. GCC-2022 Cl.46A.7 defines the PPAC
  // four-city average, and SWR's letter directs that; but Southern Railway (Sr.DFM/MDU)
  // has returned a PVC proposal demanding the zone's own city rate instead, and older
  // agreements may sit under a pre-2022 GCC. Only the contract's own terms settle it.
  return sendTelegramMessage(
    chatId,
    `⛽ <b>Fuel price basis</b>\n\nWhich diesel price does <b>this agreement</b> use for PVC?\n\n` +
      `<i>Check your tender's PVC clause — railways differ. If unsure, ask the accounts office which one they vet against.</i>`,
    {
      replyMarkup: inlineKeyboard([
        [{ text: '🇮🇳 Average of 4 cities (GCC 46A.7)', callback_data: 'fuel_four' }],
        [{ text: `📍 Zone city rate (${match.steelCity})`, callback_data: 'fuel_zone' }],
      ]),
    },
  );
}

/** Handles the fuel-basis answer, stores it on the contract, then asks for the bill. */
export async function handleFuelBasisReply(conversation: any, msg: string, chatId: string) {
  const raw = String(msg).trim().toLowerCase();
  let fuelPriceType: string | null = null;
  if (raw === 'fuel_four' || raw.includes('4') || raw.includes('four') || raw.includes('avg') || raw.includes('average')) {
    fuelPriceType = 'four_city_avg';
  } else if (raw === 'fuel_zone' || raw.includes('zone') || raw.includes('city')) {
    fuelPriceType = 'zone_city';
  }
  if (!fuelPriceType) {
    return sendTelegramMessage(chatId, 'Please tap one of the two buttons above — <b>Average of 4 cities</b> or <b>Zone city rate</b>.');
  }

  const data = getTelegramConversationData(conversation);
  // Remember it on the agreement so later bills for the same contract don't re-ask.
  if (data.docContractId) {
    try {
      await prisma.contract.update({ where: { id: data.docContractId }, data: { fuelPriceType } });
    } catch (err) {
      console.error('[Telegram] could not store contract fuelPriceType:', err);
    }
  }

  await updateTelegramConversation(conversation.id, TelegramStep.AWAITING_BILL_PDF, { docFuelPriceType: fuelPriceType });
  const label = fuelPriceType === 'four_city_avg' ? 'Average of 4 cities' : 'Zone city rate';
  await sendTelegramMessage(chatId, `✅ Fuel basis: <b>${label}</b>`);

  // Anything sent while the questions were outstanding is priced now, in order.
  if (data.docPendingBills?.length || data.docBillFileId) return maybeProcess(conversation.id, chatId);
  return sendTelegramMessage(
    chatId,
    `📎 <b>Last step:</b> send the <b>running bill (RA bill) PDF</b> and I'll calculate the PVC.\n\n` +
      `<i>Got several bills for this agreement? Send them all — each gets its own PVC.</i>`,
  );
}

/**
 * Secret coupon codes that waive the report fee, from TELEGRAM_REPORT_COUPONS
 * (comma-separated, case-insensitive). Each entry is `CODE`, `CODE:YYYY-MM-DD` or
 * `CODE:YYYY-MM-DD:N` or `CODE:YYYY-MM-DD:N:T`, where the date is the last day the
 * code is valid — so a leaked code stops working — N caps how many statements the code
 * covers for ONE chat in total, and T caps how many it covers across ALL chats. Both are
 * counted from the redemption rows written on every free statement, so a code that
 * leaks is worth at most T statements, not unlimited ones until expiry. Defaults: N 10,
 * T 25. Use `CODE::1:1` to give away exactly one statement to exactly one chat.
 * Never advertised in chat.
 */
interface CouponDef { code: string; expiry: string | null; maxReports: number | null; maxTotal: number }

const COUPON_DEFAULT_PER_CHAT = 10;
const COUPON_DEFAULT_TOTAL = 25;

function couponDefs(): CouponDef[] {
  return String(process.env.TELEGRAM_REPORT_COUPONS || '')
    .split(',')
    .map((part) => {
      const [code, expiry, max, total] = part.split(':');
      const maxReports = Number(String(max || '').trim());
      const maxTotal = Number(String(total || '').trim());
      return {
        code: String(code || '').trim().toLowerCase(),
        expiry: (expiry || '').trim() || null,
        maxReports: Number.isFinite(maxReports) && maxReports > 0 ? Math.floor(maxReports) : COUPON_DEFAULT_PER_CHAT,
        maxTotal: Number.isFinite(maxTotal) && maxTotal > 0 ? Math.floor(maxTotal) : COUPON_DEFAULT_TOTAL,
      };
    })
    .filter((c) => c.code);
}

/**
 * How many more statements this code may cover for this chat: the per-chat cap and
 * the all-chats cap, each less what the redemption rows say has already gone out.
 */
async function couponRemaining(code: string | undefined, chatId: string): Promise<{ remaining: number; perChat: number; total: number } | null> {
  const def = code ? couponDefs().find((c) => c.code === String(code).trim().toLowerCase()) : undefined;
  if (!def) return null;
  const [usedTotal, usedByChat] = await Promise.all([
    prisma.telegramCouponRedemption.count({ where: { code: def.code } }),
    prisma.telegramCouponRedemption.count({ where: { code: def.code, chatId } }),
  ]);
  const perChat = def.maxReports ?? COUPON_DEFAULT_PER_CHAT;
  const remaining = Math.max(0, Math.min(perChat - usedByChat, def.maxTotal - usedTotal));
  return { remaining, perChat, total: def.maxTotal };
}

/** A YYYY-MM-DD expiry is inclusive; expired once the (IST) date passes it. */
function couponExpired(expiry: string | null): boolean {
  if (!expiry) return false;
  return istDateKey() > expiry;
}

/** True if any coupon codes are configured at all. */
export function couponsEnabled(): boolean {
  return couponDefs().length > 0;
}

/** True if the text is a valid, unexpired waiver coupon. */
export function isCoupon(text: string): boolean {
  const t = String(text).trim().toLowerCase();
  const def = couponDefs().find((c) => c.code === t);
  return !!def && !couponExpired(def.expiry);
}

/**
 * "/coupon" — prompt the user to type their waiver code. Gives clear feedback so a
 * misconfigured env or a missing pending report is obvious.
 */
export async function startCoupon(conversation: any, chatId: string) {
  if (!couponsEnabled()) {
    return sendTelegramMessage(
      chatId,
      `🎟️ Coupons aren't set up on this bot yet. (Admin: set TELEGRAM_REPORT_COUPONS in the environment and redeploy.)`,
    );
  }
  const data = getTelegramConversationData(conversation);
  const waiting = (data.docPendingReports || []).length || (data.docPendingReport ? 1 : 0);
  if (!waiting) {
    return sendTelegramMessage(
      chatId,
      `🎟️ There's no report waiting on this chat.\n\nSend /pvc, upload the agreement + bill, and once the PVC shows, send /coupon to redeem your code.`,
    );
  }
  await updateTelegramConversation(conversation.id, TelegramStep.AWAITING_COUPON, {});
  return sendTelegramMessage(
    chatId,
    waiting > 1
      ? `🎟️ <b>Enter your coupon code:</b>\n\n<i>${waiting} statements are waiting — a code covers all of them.</i>`
      : `🎟️ <b>Enter your coupon code:</b>`,
  );
}

/** Validates a code typed after /coupon. */
export async function handleCouponInput(conversation: any, msg: string, chatId: string) {
  if (!isCoupon(msg)) {
    await updateTelegramConversation(conversation.id, TelegramStep.IDLE, {});
    return sendTelegramMessage(chatId, `❌ That coupon code isn't valid. You can pay with the link above, or send /coupon to try another code.`);
  }
  // Reset the step but keep the pending reports, then deliver free.
  await updateTelegramConversation(conversation.id, TelegramStep.IDLE, {});
  const refreshed = await getOrCreateTelegramConversation(chatId);
  return handleCoupon(refreshed, chatId, msg);
}

/**
 * A valid coupon was sent — deliver the waiting statements free of charge.
 *
 * A coupon covers the whole set, not one statement: the point of sending a batch of
 * bills is to settle them together, and a code that freed only the last of them
 * would leave the user paying for the rest one link at a time. A code may cap how
 * many it covers (see couponDefs) — the oldest statements go first.
 */
export async function handleCoupon(conversation: any, chatId: string, code?: string) {
  const data = getTelegramConversationData(conversation);
  const pending = data.docPendingReports || [];
  const waiting = pending.length || (data.docPendingReport ? 1 : 0);

  if (!waiting) {
    return sendTelegramMessage(
      chatId,
      `🎟️ Coupon noted, but there's no report waiting on this chat right now.\n\n` +
        `Send /pvc, upload the agreement + bill, then send the coupon again to get the PDF free.`,
    );
  }

  // Every free statement is written down, and a code is worth only what its caps allow:
  // so many statements per chat, so many across all chats. Without this a code was
  // redeemable without limit by any chat that learned it, and nothing recorded where it
  // had gone.
  const allowance = await couponRemaining(code, chatId);
  if (!allowance) {
    return sendTelegramMessage(chatId, '🎟️ That code is not valid any more.');
  }
  if (allowance.remaining <= 0) {
    return sendTelegramMessage(
      chatId,
      `🎟️ This code has been used up — it covered its ${allowance.perChat} statement${allowance.perChat === 1 ? '' : 's'} for this chat, or its ${allowance.total} in total. Send /payall for a payment link.`,
    );
  }
  const cap = allowance.remaining;
  const covered = Math.min(cap, waiting);
  const normalizedCode = String(code || '').trim().toLowerCase();
  const recordRedemption = async (linkId: string | null) => {
    try {
      await prisma.telegramCouponRedemption.create({ data: { code: normalizedCode, chatId, linkId } });
    } catch (err) {
      console.error('[Telegram] could not record coupon redemption:', err);
    }
  };

  await sendTelegramMessage(
    chatId,
    covered > 1
      ? `🎟️ <b>Coupon accepted — fee waived for ${covered} statements.</b> Preparing them now…`
      : '🎟️ <b>Coupon accepted — fee waived.</b> Preparing your report…',
  );

  const { renderAndSendPaidReport } = await import('./telegram-bill-pvc');
  // Oldest first, and the link ids are read up front: each delivery retires its own
  // entry, so walking the live list would skip every other one.
  const linkIds = pending.slice(0, covered).map((r) => r.linkId);
  let delivered = 0;
  let failures = 0;

  try {
    if (!linkIds.length) {
      // Older chat with only the single slot and no link to name.
      if (await renderAndSendPaidReport(chatId)) { delivered++; await recordRedemption(null); }
    } else {
      for (const linkId of linkIds) {
        try {
          if (await renderAndSendPaidReport(chatId, linkId)) { delivered++; await recordRedemption(linkId); }
        } catch (err: any) {
          failures++;
          console.error('[Telegram] coupon delivery failed for', linkId, err);
        }
      }
    }
  } catch (err: any) {
    console.error('[Telegram] coupon delivery failed:', err);
    return sendTelegramMessage(chatId, `⚠️ Couldn't build the PDF: ${escapeHtml(err?.message || 'unknown error')}`);
  }

  if (!delivered && !failures) {
    return sendTelegramMessage(chatId, 'Those reports were already delivered — check the messages above.');
  }
  if (failures) {
    return sendTelegramMessage(
      chatId,
      `⚠️ ${delivered} of ${covered} statements went out; ${failures} failed to build. Send the coupon again to retry the rest — it hasn't been used up.`,
    );
  }
  if (waiting > covered) {
    return sendTelegramMessage(
      chatId,
      `🎟️ This code had ${cap} statement${cap === 1 ? '' : 's'} left on it, so ${waiting - covered} ${waiting - covered === 1 ? 'is' : 'are'} still waiting. Send /payall for a link covering ${waiting - covered === 1 ? 'it' : 'them'}.`,
    );
  }
}

/**
 * "/payall" — one payment link for every statement still waiting, instead of paying
 * bill by bill. Each priced bill gets its own link as it is calculated, which is a
 * nuisance when someone has just sent a year's bills; this replaces them with a
 * single link that delivers the whole set once paid.
 */
export async function handlePayAll(conversation: any, chatId: string) {
  const data = getTelegramConversationData(conversation);
  const pending = data.docPendingReports || [];

  if (!pending.length) {
    return sendTelegramMessage(
      chatId,
      `There are no statements waiting for payment on this chat.\n\n` +
        `Send /pvc, upload the agreement and your bills, and I'll price each one.`,
    );
  }

  try {
    const { getReportPriceRupees, createReportPaymentLink } = await import('./telegram-payment');
    const unitPrice = await getReportPriceRupees();
    const total = unitPrice * pending.length;

    // Unpaid statements survive a /pvc restart, so the set can span more than one
    // agreement — name them from the reports themselves rather than from whichever
    // contract the chat happens to be working on now.
    const contractIds = [...new Set(pending.map((r) => r.payload?.contractId).filter(Boolean))];
    const contracts = await prisma.contract.findMany({
      where: { id: { in: contractIds } },
      select: { agreementNo: true },
    });
    const agreementNos = contracts.map((c) => displayAgreementNo(c.agreementNo)).filter(Boolean);
    const agreementNo = agreementNos.length === 1
      ? agreementNos[0]
      : agreementNos.length > 1
        ? `${agreementNos.length} agreements`
        : displayAgreementNo(data.docContractAgreementNo) || 'PVC';

    const link = await createReportPaymentLink({
      chatId,
      amountRupees: total,
      agreementNo,
      reportCount: pending.length,
    });

    const coversLinkIds = pending.map((r) => r.linkId);
    await mutateTelegramConversationData(conversation.id, (current) => ({
      ...current,
      docBundlePayments: [
        ...(current.docBundlePayments || []).filter((b) => b.linkId !== link.id),
        { linkId: link.id, coversLinkIds },
      ].slice(-MAX_BUNDLE_LINKS),
    }));

    const billList = pending
      .map((r) => `\n   • ${escapeHtml(String(r.payload?.billNo || 'RA Bill'))}`)
      .join('');

    return sendTelegramMessage(
      chatId,
      `🧾 <b>One payment for all ${pending.length} statements</b>\n\n` +
        `📄 Agreement: <b>${escapeHtml(agreementNo)}</b>${billList}\n\n` +
        `💰 ₹${formatRupees(unitPrice)} × ${pending.length} = <b>₹${formatRupees(total)}</b>\n\n` +
        `Pay by UPI / card / net banking here:\n${link.url}\n\n` +
        `When this is paid I'll send all ${pending.length} statements together. ` +
        `<i>Use this link instead of the individual ones above — paying those as well would charge you twice.\n` +
        `Have a coupon? Send /coupon — it covers every statement waiting.</i>`,
    );
  } catch (err: any) {
    console.error('[Telegram] /payall link creation failed:', err);
    return sendTelegramMessage(
      chatId,
      `⚠️ I couldn't create the combined payment link just now. The individual links above still work — or send /payall again in a moment.`,
    );
  }
}

/**
 * "/paid" — the user says they've paid but no report arrived (usually because the
 * Razorpay webhook never reached us). Ask Razorpay directly and deliver if it's paid.
 */
export async function handlePaidCheck(conversation: any, chatId: string) {
  const data = getTelegramConversationData(conversation);
  if (!data.docPendingReport) {
    return sendTelegramMessage(
      chatId,
      `I don't have a report waiting for payment on this chat.\n\n` +
        `If you already received it, you're all set. Otherwise send /pvc to start again.`,
    );
  }
  // Every unpaid link, not just the newest: with several bills in flight the user may
  // well have paid for an earlier one, and checking only the last would tell them
  // (wrongly) that no payment had come through.
  const linkIds = [
    // Combined links first: paying one of those covers several reports at once, so
    // settling it up front saves checking each of them separately.
    ...(data.docBundlePayments || []).map((b) => b.linkId),
    ...(data.docPendingReports || []).map((r) => r.linkId),
    ...(data.docPendingPaymentLinkId ? [data.docPendingPaymentLinkId] : []),
  ].filter((id, index, all) => id && all.indexOf(id) === index);

  if (!linkIds.length) {
    return sendTelegramMessage(chatId, `I couldn't find the payment reference for this chat. Please send /pvc and try again.`);
  }

  await sendTelegramMessage(chatId, '🔎 Checking your payment…');
  const { isPaymentLinkPaid } = await import('./telegram-payment');
  const { renderAndSendPaidReport } = await import('./telegram-bill-pvc');

  let delivered = 0;
  let anyPaid = false;
  for (const linkId of linkIds) {
    if (!(await isPaymentLinkPaid(linkId))) continue;
    anyPaid = true;
    try {
      if (await renderAndSendPaidReport(chatId, linkId)) delivered++;
    } catch (err: any) {
      console.error('[Telegram] /paid delivery failed:', err);
      await sendTelegramMessage(chatId, `⚠️ Payment confirmed, but I hit a problem building the PDF: ${escapeHtml(err?.message || 'unknown error')}`);
    }
  }

  if (!anyPaid) {
    return sendTelegramMessage(
      chatId,
      `❌ Razorpay hasn't confirmed that payment yet.\n\n` +
        `If you've just paid, wait a moment and send /paid again. If the money left your account but this keeps failing, contact support with your payment reference.`,
    );
  }
  if (!delivered) {
    return sendTelegramMessage(chatId, '✅ Payment confirmed, but the report was already delivered. Check the messages above.');
  }
}

/**
 * Nudge when the user sends text while a PDF is expected.
 */
export async function remindToUpload(step: TelegramStep, chatId: string) {
  const which = step === TelegramStep.AWAITING_BILL_PDF
    ? { n: '2 of 2', what: 'running bill (RA bill) PDF' }
    : { n: '1 of 2', what: 'tender agreement PDF (or the LOA, if the agreement isn\'t signed yet)' };
  return sendTelegramMessage(
    chatId,
    `📎 <b>Step ${which.n}:</b> please attach the <b>${which.what}</b> using the 📎 clip button.\n\n` +
      `<i>/cancel to stop.</i>`,
  );
}

/**
 * When both the contract (from the agreement) and the bill PDF are in hand, run
 * the extraction + PVC and reply. Delegates to the Stage-2 PVC module.
 */
async function maybeProcess(conversationId: string, chatId: string) {
  const conv = await prisma.telegramConversation.findUnique({ where: { id: conversationId } });
  const data = getTelegramConversationData(conv);
  // Need the contract and the confirmed zone/fuel basis before pricing anything.
  if (!data.docContractId || !data.docZone || !data.docFuelPriceType) return;

  // Everything that was waiting, oldest first. The legacy single slot is included so
  // a run paused mid-flight (tender date, account linking) still resumes.
  const queue = [...(data.docPendingBills || [])];
  if (!queue.length && data.docBillFileId) {
    queue.push({ fileId: data.docBillFileId, fileName: data.docBillFileName || 'bill.pdf' });
  }
  if (!queue.length) return;

  for (const [index, bill] of queue.entries()) {
    if (queue.length > 1) {
      await sendTelegramMessage(chatId, `📄 <b>Bill ${index + 1} of ${queue.length}</b> — ${escapeHtml(bill.fileName)}`);
    }
    // One bill needing an answer stops the run: the reply it is waiting for would
    // otherwise be read against a later bill. What's left stays queued.
    const paused = await processOneBill(conversationId, chatId, bill);
    if (paused) return;
  }
}

/**
 * Prices one bill and clears it from the queue. Returns true when the run paused to
 * ask the user something, in which case the caller must stop and leave the rest
 * queued for when they answer.
 */
async function processOneBill(
  conversationId: string,
  chatId: string,
  bill: { fileId: string; fileName: string },
): Promise<boolean> {
  const conv = await prisma.telegramConversation.findUnique({ where: { id: conversationId } });
  const data = getTelegramConversationData(conv);
  if (!data.docContractId) return false;

  await sendTelegramChatAction(chatId, 'upload_document');
  let needsInput = false;
  try {
    const result = await processUploadedBillPvc({
      chatId,
      conversationId,
      contractId: data.docContractId,
      billFileId: bill.fileId,
      billFileName: bill.fileName,
    });
    needsInput = !!result?.needsInput;
  } catch (err: any) {
    console.error('[Telegram] PVC processing failed:', err);
    await sendTelegramMessage(chatId, `❌ PVC calculation failed for <b>${escapeHtml(bill.fileName)}</b>: ${escapeHtml(err.message || 'unknown error')}`);
  }

  // Waiting on an answer → put this bill at the head of the queue so the run picks up
  // where it stopped. Otherwise take just this bill out, by file id: a bill that
  // arrived while this one was pricing must survive, so the queue is never replaced
  // wholesale.
  await mutateTelegramConversationData(
    conversationId,
    (current) => {
      const others = (current.docPendingBills || []).filter((b) => b.fileId !== bill.fileId);
      const queue = needsInput ? [bill, ...others] : others;
      return {
        ...current,
        docPendingBills: queue.length ? queue : undefined,
        docBillFileId: queue.length ? queue[0].fileId : undefined,
        docBillFileName: queue.length ? queue[0].fileName : undefined,
      };
    },
    needsInput ? undefined : TelegramStep.IDLE,
  );
  return needsInput;
}

/**
 * Reuse a contract when the same agreement number already exists (per the user's
 * choice), otherwise create one — with schedules/rates so PVC is correct. The
 * owner is the chat's linked user, or the shared guest account.
 */
/**
 * The real agreement number as printed on the agreement, stripped of the internal
 * per-chat namespace suffix guest contracts carry. Use this everywhere we DISPLAY
 * the agreement number to the user or in the report.
 */
export function displayAgreementNo(stored: string | null | undefined): string {
  return String(stored || '').replace(/\s*·\s*tg:\S+$/i, '').trim();
}

async function findOrCreateContractFromAgreement(
  conversationId: string,
  data: ExtractedAgreement,
) {
  // An LOA has no agreement number yet, so it is keyed by its LOA number until the
  // bill supplies the real one (see backfillContractFromBill).
  const realNo = nonEmpty(data.agreementNo)
    ? String(data.agreementNo).trim()
    : `LOA ${String(data.loaNo).trim()}`;

  const conv = await prisma.telegramConversation.findUnique({ where: { id: conversationId } });
  const linkedUserId = conv?.userId || null;
  const ownerId = linkedUserId || (await getTelegramGuestUserId());

  // ISOLATION: agreementNo is globally unique, so a plain lookup/create would let an
  // anonymous chat READ or OVERWRITE a real customer's contract (and squat unused
  // numbers). Guest (unlinked) chats therefore store a per-chat namespaced key so
  // their contracts live in a separate keyspace and can never touch real ones. Linked
  // users keep their real contracts. Either way we only ever reuse a contract owned
  // by THIS chat's owner.
  const storedNo = linkedUserId ? realNo : `${realNo} · tg:${conv?.chatId || conversationId}`;

  const existing = await prisma.contract.findFirst({ where: { agreementNo: storedNo, userId: ownerId } });
  if (existing) return existing;

  const agreementNo = storedNo;

  // Opening date drives the base month (month before the tender closing date).
  // Callers guarantee a date is present — never fall back to "today".
  const openingDate = agreementOpeningDate(data)!;
  const baseMonth = getBaseMonth(openingDate);

  const schedules: ContractSchedule[] = (data.schedules || []).map((s) => ({
    name: s.name,
    escalation: s.escalation || '',
    bidRate: s.bidRate || '',
  }));

  const toNum = (v: unknown): number | null => {
    const n = Number(String(v ?? '').replace(/,/g, ''));
    return Number.isFinite(n) && n > 0 ? n : null;
  };

  try {
    return await prisma.contract.create({
      data: {
        // Sent in through the bot, by definition.
        createdVia: 'telegram',
        agreementNo,
        loaNo: data.loaNo || null,
        loaDate: data.loaDate ? new Date(data.loaDate) : null,
        contractorName: data.contractorName || 'Unknown',
        contractorPhone: data.contractorPhone || null,
        workDescription: data.workDescription || 'Work as per agreement',
        dateOfOpening: openingDate,
        baseMonth,
        completionPeriodMonths: (() => {
          const m = Number(data.completionPeriodMonths);
          return Number.isFinite(m) && m > 0 ? Math.round(m) : null;
        })(),
        tenderAdvertisedValue: toNum(data.tenderAdvertisedValue),
        contractValue: toNum(data.agreementAmount),
        schedules: schedules as any,
        userId: ownerId,
        pvcApplicable: true,
      },
    });
  } catch (err: any) {
    // A linked user's real agreement number is already owned by a DIFFERENT account.
    // Never attach to it — tell them to use the website instead. (Guests can't hit
    // this: their key is namespaced by chat id.)
    if (err?.code === 'P2002') {
      throw new Error(`Agreement ${realNo} already exists under another account. Please manage it on the website.`);
    }
    throw err;
  }
}

/**
 * Continue a paused document run — used after the user links their account by
 * phone, so the report they were waiting for is produced without re-uploading.
 */
export async function resumeDocumentFlow(conversationId: string, chatId: string) {
  return maybeProcess(conversationId, chatId);
}

/**
 * The tender closing date from an extracted agreement, or null when absent.
 * Base month = month BEFORE this date, so a wrong value silently zeroes the PVC.
 */
function agreementOpeningDate(data: ExtractedAgreement): Date | null {
  // Deliberately NOT falling back to the LOA date. The LOA is issued weeks or months
  // after the tender closes, so using it would quietly move the base month forward
  // and understate every quarter's PVC. Better to ask the user for the closing date —
  // which is what the caller does when this returns null.
  for (const raw of [data.dateOfOpening, data.closingDate]) {
    if (!raw) continue;
    const d = new Date(raw);
    if (!isNaN(d.getTime()) && d.getFullYear() > 1970 && d.getFullYear() < 2100) return d;
  }
  return null;
}

/** Parses DD/MM/YYYY (also accepts - or . separators). */
function parseDdMmYyyy(input: string): Date | null {
  const m = String(input).trim().match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
  if (isNaN(d.getTime()) || d.getMonth() !== Number(mm) - 1) return null;
  return d;
}

/**
 * User replied with the tender closing date — either to finish creating a contract
 * whose agreement had no date, or to correct one whose base month was wrong (Q0).
 * Then the PVC run continues automatically.
 */
export async function handleTenderDateReply(conversation: any, msg: string, chatId: string) {
  const date = parseDdMmYyyy(msg);
  if (!date) {
    return sendTelegramMessage(chatId, '❌ I need the date as <b>DD/MM/YYYY</b> (e.g. 15/03/2024). Please try again:');
  }

  const data = getTelegramConversationData(conversation);
  const baseMonth = getBaseMonth(date);
  const fmt = (d: Date) => d.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' });

  try {
    if (data.docPendingAgreement) {
      // Finish creating the contract now that we have the date.
      const pending: ExtractedAgreement = { ...data.docPendingAgreement, dateOfOpening: date.toISOString() };
      const contract = await findOrCreateContractFromAgreement(conversation.id, pending);
      await updateTelegramConversation(conversation.id, TelegramStep.IDLE, {
        docContractId: contract.id,
        docContractAgreementNo: displayAgreementNo(contract.agreementNo),
        docPendingAgreement: undefined,
      });
      await sendTelegramMessage(
        chatId,
        `✅ Saved. Tender closing date <b>${fmt(date)}</b> → base month <b>${fmt(baseMonth)}</b>.\n\n` +
          `Agreement: <b>${escapeHtml(displayAgreementNo(contract.agreementNo))}</b>`,
      );
    } else if (data.docContractId) {
      // Correct an existing contract whose date/base month was wrong.
      await prisma.contract.update({
        where: { id: data.docContractId },
        data: { dateOfOpening: date, baseMonth },
      });
      await updateTelegramConversation(conversation.id, TelegramStep.IDLE, {});
      await sendTelegramMessage(
        chatId,
        `✅ Updated. Tender closing date <b>${fmt(date)}</b> → base month <b>${fmt(baseMonth)}</b>. Recalculating…`,
      );
    } else {
      await updateTelegramConversation(conversation.id, TelegramStep.IDLE, {});
      return sendTelegramMessage(chatId, 'Please send the agreement PDF first.');
    }
  } catch (err: any) {
    console.error('[Telegram] tender date update failed:', err);
    return sendTelegramMessage(chatId, `❌ Could not save that date: ${escapeHtml(err?.message || 'unknown error')}`);
  }

  return maybeProcess(conversation.id, chatId);
}

// ─── small helpers ───────────────────────────────────
function nonEmpty(value: unknown): boolean {
  return !!(value && String(value).trim());
}
function formatRupees(value: number): string {
  return (Number(value) || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
}
function escapeHtml(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + '…' : s;
}
