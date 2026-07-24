/**
 * Telegram Conversation Management
 * Mirrors WhatsApp conversation flow for Telegram bot
 */

import { prisma } from './db';

// Reuse the same conversation steps as WhatsApp
export enum TelegramStep {
  IDLE = 'IDLE',
  AWAITING_COMMAND = 'AWAITING_COMMAND',
  AWAITING_PHONE = 'AWAITING_PHONE', // Link phone to account
  // Document (PDF) PVC flow: the agreement had no tender closing date, or the
  // stored one is wrong (quarter came out Q0), so ask the user for it.
  AWAITING_TENDER_DATE = 'AWAITING_TENDER_DATE',
  // Contract creation steps
  AWAITING_AGREEMENT_NO = 'AWAITING_AGREEMENT_NO',
  AWAITING_CONTRACTOR_NAME = 'AWAITING_CONTRACTOR_NAME',
  AWAITING_WORK_DESCRIPTION = 'AWAITING_WORK_DESCRIPTION',
  AWAITING_OPENING_DATE = 'AWAITING_OPENING_DATE',
  AWAITING_LOA_NO = 'AWAITING_LOA_NO',
  AWAITING_CONTRACTOR_PHONE = 'AWAITING_CONTRACTOR_PHONE',
  CONFIRMING_CONTRACT = 'CONFIRMING_CONTRACT',
  // Bill creation steps
  AWAITING_CONTRACT = 'AWAITING_CONTRACT',
  AWAITING_BILL_NO = 'AWAITING_BILL_NO',
  AWAITING_AMOUNT = 'AWAITING_AMOUNT',
  AWAITING_DATE = 'AWAITING_DATE',
  AWAITING_CLASSIFICATION = 'AWAITING_CLASSIFICATION',
  AWAITING_CEMENT_CONFIRM = 'AWAITING_CEMENT_CONFIRM',
  AWAITING_CEMENT_PERCENTAGE = 'AWAITING_CEMENT_PERCENTAGE',
  AWAITING_STEEL_CONFIRM = 'AWAITING_STEEL_CONFIRM',
  AWAITING_STEEL_PERCENTAGE = 'AWAITING_STEEL_PERCENTAGE',
  AWAITING_STEEL_TYPE = 'AWAITING_STEEL_TYPE',
  CONFIRMING = 'CONFIRMING',
}

export interface TelegramConversationData {
  // Account linking
  phone?: string; // phone used to link account
  // Contract creation
  agreementNo?: string;
  contractorName?: string;
  workDescription?: string;
  dateOfOpening?: string;
  loaNo?: string;
  contractorPhone?: string;
  // Bill creation
  contractId?: string;
  contractIds?: string[];
  billNo?: string;
  billAmount?: number;
  dateOfMeasurement?: string;
  classificationId?: string;
  classificationIds?: string[];
  classificationName?: string;
  cementPercentage?: number;
  steelPercentage?: number;
  selectedSteelTypes?: string[];
  // Document-upload PVC flow (agreement + bill PDFs sent to the bot)
  docContractId?: string;      // contract resolved/created from the uploaded agreement
  docContractAgreementNo?: string;
  docBillFileId?: string;      // Telegram file_id of the uploaded bill PDF (downloaded on process)
  docBillFileName?: string;
  /** Extracted agreement fields held back until the user supplies the tender closing date. */
  docPendingAgreement?: any;
  /** Report data waiting on payment — rendered and sent by the Razorpay webhook. */
  docPendingReport?: any;
}

/**
 * Get or create a conversation for a Telegram chat ID
 */
export async function getOrCreateTelegramConversation(chatId: string) {
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  let conversation = await prisma.telegramConversation.findUnique({
    where: { chatId },
    include: { user: true },
  });

  if (conversation && conversation.lastMessageAt < twentyFourHoursAgo) {
    conversation = await prisma.telegramConversation.update({
      where: { id: conversation.id },
      data: {
        currentStep: TelegramStep.IDLE,
        conversationData: {},
        lastMessageAt: new Date(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
      include: { user: true },
    });
  } else if (!conversation) {
    conversation = await prisma.telegramConversation.create({
      data: {
        chatId,
        currentStep: TelegramStep.IDLE,
        conversationData: {},
        lastMessageAt: new Date(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
      include: { user: true },
    });
  }

  return conversation;
}

/**
 * Update conversation step and data
 */
export async function updateTelegramConversation(
  conversationId: string,
  step: TelegramStep,
  data: Partial<TelegramConversationData> = {}
) {
  const current = await prisma.telegramConversation.findUnique({
    where: { id: conversationId },
  });
  if (!current) throw new Error('Conversation not found');

  const currentData = (current.conversationData as TelegramConversationData) || {};
  const updatedData = { ...currentData, ...data };

  return await prisma.telegramConversation.update({
    where: { id: conversationId },
    data: {
      currentStep: step,
      conversationData: updatedData as any,
      lastMessageAt: new Date(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
    include: { user: true },
  });
}

/**
 * Link a Telegram conversation to a user by phone number
 */
export async function linkTelegramToUser(conversationId: string, phone: string) {
  // Normalise phone
  let cleaned = phone.replace(/\D/g, '');
  if (!cleaned.startsWith('91') && cleaned.length === 10) cleaned = '91' + cleaned;

  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { phone: cleaned },
        { phone: '+' + cleaned },
        { phone: cleaned.replace(/^91/, '') },
      ],
    },
  });

  if (user) {
    await prisma.telegramConversation.update({
      where: { id: conversationId },
      data: { userId: user.id },
    });
    return user;
  }
  return null;
}

export async function resetTelegramConversation(conversationId: string) {
  return await prisma.telegramConversation.update({
    where: { id: conversationId },
    data: {
      currentStep: TelegramStep.IDLE,
      conversationData: {},
      lastMessageAt: new Date(),
    },
    include: { user: true },
  });
}

export function getTelegramConversationData(conversation: any): TelegramConversationData {
  return (conversation.conversationData as TelegramConversationData) || {};
}
