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
  // agreement. Only treat it as the agreement when the model says so AND it found a
  // number; anything else (bill / other) is handled as the bill PDF.
  const data = extraction.ok ? extraction.data ?? null : null;
  const looksLikeAgreement =
    !!data && data.documentType === 'agreement' && !!(data.agreementNo && String(data.agreementNo).trim());

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
  if (!agreementOpeningDate(data)) {
    await updateTelegramConversation(conversationId, TelegramStep.AWAITING_TENDER_DATE, {
      docPendingAgreement: data,
    });
    return sendTelegramMessage(
      chatId,
      `📄 I read the agreement <b>${escapeHtml(String(data.agreementNo || ''))}</b>, but I couldn't find the <b>tender closing date</b> in it.\n\n` +
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
      `✅ <b>Agreement read</b>\n\n` +
        `📄 Agreement No: <b>${escapeHtml(displayAgreementNo(contract.agreementNo))}</b>\n` +
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

  // Keep the bill, but don't skip ahead: the agreement (and the zone/fuel answers)
  // are still needed before the PVC can be worked out.
  const nextStep = !haveContract
    ? TelegramStep.AWAITING_AGREEMENT_PDF
    : answeredQuestions
      ? TelegramStep.IDLE
      : (conv0?.currentStep as TelegramStep) || TelegramStep.AWAITING_ZONE;

  await updateTelegramConversation(conversationId, nextStep, {
    docBillFileId: doc.file_id,
    docBillFileName: doc.file_name || 'bill.pdf',
  });

  if (haveContract && answeredQuestions) {
    await sendTelegramMessage(chatId, `✅ <b>Bill received.</b> Calculating your PVC…`);
    return maybeProcess(conversationId, chatId);
  }
  if (haveContract) {
    return sendTelegramMessage(chatId, `✅ <b>Bill received</b> — I'll keep it. Please answer the question above first.`);
  }
  return sendTelegramMessage(
    chatId,
    `✅ <b>Bill received</b> — I'll keep it.\n\n` +
      `📎 <b>Now send the tender agreement PDF</b> (I need it for the schedules, rates and base month), and I'll calculate the PVC.`,
  );
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
    docPendingAgreement: undefined,
    docPendingReport: undefined,
    docPendingPaymentLinkId: undefined,
    docZone: undefined,
    docFuelPriceType: undefined,
  });
  return sendTelegramMessage(
    chatId,
    `🚂 <b>Let's work out your PVC</b>\n\n` +
      `I need two PDFs — one at a time.\n\n` +
      `📎 <b>Step 1 of 2:</b> send the <b>tender agreement PDF</b>.\n\n` +
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

  if (data.docBillFileId) return maybeProcess(conversation.id, chatId);
  return sendTelegramMessage(chatId, `📎 <b>Last step:</b> send the <b>running bill (RA bill) PDF</b> and I'll calculate the PVC.`);
}

/**
 * Secret coupon codes that waive the report fee, from TELEGRAM_REPORT_COUPONS
 * (comma-separated, case-insensitive). Each entry is `CODE` or `CODE:YYYY-MM-DD`,
 * where the date is the last day the code is valid — so a leaked code stops working.
 * Never advertised in chat.
 */
interface CouponDef { code: string; expiry: string | null }

function couponDefs(): CouponDef[] {
  return String(process.env.TELEGRAM_REPORT_COUPONS || '')
    .split(',')
    .map((part) => {
      const [code, expiry] = part.split(':');
      return { code: String(code || '').trim().toLowerCase(), expiry: (expiry || '').trim() || null };
    })
    .filter((c) => c.code);
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
  if (!data.docPendingReport) {
    return sendTelegramMessage(
      chatId,
      `🎟️ There's no report waiting on this chat.\n\nSend /pvc, upload the agreement + bill, and once the PVC shows, send /coupon to redeem your code.`,
    );
  }
  await updateTelegramConversation(conversation.id, TelegramStep.AWAITING_COUPON, {});
  return sendTelegramMessage(chatId, `🎟️ <b>Enter your coupon code:</b>`);
}

/** Validates a code typed after /coupon. */
export async function handleCouponInput(conversation: any, msg: string, chatId: string) {
  if (!isCoupon(msg)) {
    await updateTelegramConversation(conversation.id, TelegramStep.IDLE, {});
    return sendTelegramMessage(chatId, `❌ That coupon code isn't valid. You can pay with the link above, or send /coupon to try another code.`);
  }
  // Reset the step but keep the pending report, then deliver free.
  await updateTelegramConversation(conversation.id, TelegramStep.IDLE, {});
  const refreshed = await getOrCreateTelegramConversation(chatId);
  return handleCoupon(refreshed, chatId);
}

/**
 * A valid coupon was sent — deliver the pending report for free (no payment).
 */
export async function handleCoupon(conversation: any, chatId: string) {
  const data = getTelegramConversationData(conversation);
  if (!data.docPendingReport) {
    return sendTelegramMessage(
      chatId,
      `🎟️ Coupon noted, but there's no report waiting on this chat right now.\n\n` +
        `Send /pvc, upload the agreement + bill, then send the coupon again to get the PDF free.`,
    );
  }
  await sendTelegramMessage(chatId, '🎟️ <b>Coupon accepted — fee waived.</b> Preparing your report…');
  try {
    const { renderAndSendPaidReport } = await import('./telegram-bill-pvc');
    const sent = await renderAndSendPaidReport(chatId);
    if (!sent) {
      return sendTelegramMessage(chatId, 'That report was already delivered — check the messages above.');
    }
  } catch (err: any) {
    console.error('[Telegram] coupon delivery failed:', err);
    return sendTelegramMessage(chatId, `⚠️ Couldn't build the PDF: ${escapeHtml(err?.message || 'unknown error')}`);
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
  const linkId = data.docPendingPaymentLinkId;
  if (!linkId) {
    return sendTelegramMessage(chatId, `I couldn't find the payment reference for this chat. Please send /pvc and try again.`);
  }

  await sendTelegramMessage(chatId, '🔎 Checking your payment…');
  const { isPaymentLinkPaid } = await import('./telegram-payment');
  const paid = await isPaymentLinkPaid(linkId);
  if (!paid) {
    return sendTelegramMessage(
      chatId,
      `❌ Razorpay hasn't confirmed that payment yet.\n\n` +
        `If you've just paid, wait a moment and send /paid again. If the money left your account but this keeps failing, contact support with your payment reference.`,
    );
  }

  try {
    const { renderAndSendPaidReport } = await import('./telegram-bill-pvc');
    const sent = await renderAndSendPaidReport(chatId);
    if (!sent) {
      return sendTelegramMessage(chatId, '✅ Payment confirmed, but the report was already delivered. Check the messages above.');
    }
  } catch (err: any) {
    console.error('[Telegram] /paid delivery failed:', err);
    return sendTelegramMessage(chatId, `⚠️ Payment confirmed, but I hit a problem building the PDF: ${escapeHtml(err?.message || 'unknown error')}`);
  }
}

/**
 * Nudge when the user sends text while a PDF is expected.
 */
export async function remindToUpload(step: TelegramStep, chatId: string) {
  const which = step === TelegramStep.AWAITING_BILL_PDF
    ? { n: '2 of 2', what: 'running bill (RA bill) PDF' }
    : { n: '1 of 2', what: 'tender agreement PDF' };
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
  // Need the contract, the bill, and the confirmed zone before pricing.
  if (!data.docContractId || !data.docBillFileId || !data.docZone || !data.docFuelPriceType) return;

  await sendTelegramChatAction(chatId, 'upload_document');
  let needsInput = false;
  try {
    const result = await processUploadedBillPvc({
      chatId,
      conversationId,
      contractId: data.docContractId,
      billFileId: data.docBillFileId,
      billFileName: data.docBillFileName || 'bill.pdf',
    });
    needsInput = !!result?.needsInput;
  } catch (err: any) {
    console.error('[Telegram] PVC processing failed:', err);
    await sendTelegramMessage(chatId, `❌ PVC calculation failed: ${escapeHtml(err.message || 'unknown error')}`);
  }
  // Clear the uploaded bill so a fresh bill can be sent next, but keep the contract
  // so more bills can follow. When we're waiting on the tender date, keep the bill
  // so the recalculation can run as soon as the user answers.
  if (!needsInput) {
    await updateTelegramConversation(conversationId, TelegramStep.IDLE, {
      docBillFileId: undefined,
      docBillFileName: undefined,
    });
  }
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
  const realNo = String(data.agreementNo).trim();

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
  for (const raw of [data.dateOfOpening, data.closingDate, data.loaDate]) {
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
function escapeHtml(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + '…' : s;
}
