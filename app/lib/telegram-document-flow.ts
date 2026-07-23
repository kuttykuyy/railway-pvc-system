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
import { sendTelegramMessage, sendTelegramChatAction, downloadTelegramFile } from './telegram-api';
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

  const looksLikeAgreement =
    extraction.ok && !!(extraction.data?.agreementNo && String(extraction.data.agreementNo).trim());

  if (looksLikeAgreement) {
    return handleAgreementDoc(conversation.id, chatId, extraction.data ?? null, doc);
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
  try {
    const contract = await findOrCreateContractFromAgreement(conversationId, data);
    await updateTelegramConversation(conversationId, TelegramStep.IDLE, {
      docContractId: contract.id,
      docContractAgreementNo: contract.agreementNo,
    });

    await sendTelegramMessage(
      chatId,
      `✅ <b>Agreement read</b>\n\n` +
        `📄 Agreement No: <b>${escapeHtml(contract.agreementNo)}</b>\n` +
        (contract.contractorName ? `👤 Contractor: <b>${escapeHtml(contract.contractorName)}</b>\n` : '') +
        (contract.workDescription ? `🏗️ Work: <b>${escapeHtml(truncate(contract.workDescription, 80))}</b>\n` : '') +
        `\nNow send the <b>running bill (RA bill) PDF</b> and I'll calculate the PVC.`,
    );

    // If the bill already arrived first, we can process now.
    return maybeProcess(conversationId, chatId);
  } catch (err: any) {
    console.error('[Telegram] contract create failed:', err);
    return sendTelegramMessage(chatId, `❌ Could not set up the contract: ${escapeHtml(err.message || 'unknown error')}`);
  }
}

async function handleBillDoc(conversationId: string, chatId: string, doc: TelegramDocument) {
  await updateTelegramConversation(conversationId, TelegramStep.IDLE, {
    docBillFileId: doc.file_id,
    docBillFileName: doc.file_name || 'bill.pdf',
  });

  const conv = await prisma.telegramConversation.findUnique({ where: { id: conversationId } });
  const stored = getTelegramConversationData(conv);
  if (stored.docContractId) {
    await sendTelegramMessage(chatId, `✅ <b>Bill received.</b> Calculating PVC…`);
    return maybeProcess(conversationId, chatId);
  }
  return sendTelegramMessage(
    chatId,
    `✅ <b>Bill received.</b>\n\nNow send the <b>tender agreement PDF</b> so I can read the schedules and rates, then I'll calculate the PVC.`,
  );
}

/**
 * When both the contract (from the agreement) and the bill PDF are in hand, run
 * the extraction + PVC and reply. Delegates to the Stage-2 PVC module.
 */
async function maybeProcess(conversationId: string, chatId: string) {
  const conv = await prisma.telegramConversation.findUnique({ where: { id: conversationId } });
  const data = getTelegramConversationData(conv);
  if (!data.docContractId || !data.docBillFileId) return; // still waiting for the other file

  await sendTelegramChatAction(chatId, 'upload_document');
  try {
    await processUploadedBillPvc({
      chatId,
      conversationId,
      contractId: data.docContractId,
      billFileId: data.docBillFileId,
      billFileName: data.docBillFileName || 'bill.pdf',
    });
  } catch (err: any) {
    console.error('[Telegram] PVC processing failed:', err);
    await sendTelegramMessage(chatId, `❌ PVC calculation failed: ${escapeHtml(err.message || 'unknown error')}`);
  } finally {
    // Clear the uploaded bill so a fresh bill can be sent next, but keep the
    // contract so the user can send more bills for the same agreement.
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
async function findOrCreateContractFromAgreement(
  conversationId: string,
  data: ExtractedAgreement,
) {
  const agreementNo = String(data.agreementNo).trim();

  const existing = await prisma.contract.findUnique({ where: { agreementNo } });
  if (existing) return existing;

  const conv = await prisma.telegramConversation.findUnique({ where: { id: conversationId } });
  const ownerId = conv?.userId || (await getTelegramGuestUserId());

  // Opening date drives the base month (month before the tender closing date).
  const openingDate = data.dateOfOpening ? new Date(data.dateOfOpening) : new Date();
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

  return prisma.contract.create({
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
}

// ─── small helpers ───────────────────────────────────
function escapeHtml(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + '…' : s;
}
