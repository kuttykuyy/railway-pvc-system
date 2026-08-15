/**
 * Telegram Conversation Management
 * Mirrors WhatsApp conversation flow for Telegram bot
 */

import { prisma } from './db';
import { Prisma } from '@prisma/client';

// Reuse the same conversation steps as WhatsApp
export enum TelegramStep {
  IDLE = 'IDLE',
  AWAITING_COMMAND = 'AWAITING_COMMAND',
  AWAITING_PHONE = 'AWAITING_PHONE', // Link phone to account
  // The code sent to that phone's WhatsApp. A phone number alone proved nothing:
  // anyone knowing a customer's number could bind their own chat to that account and
  // read its contracts and bills.
  AWAITING_LINK_OTP = 'AWAITING_LINK_OTP',
  // Guided PDF → PVC flow: agreement → zone → fuel basis → bill.
  AWAITING_AGREEMENT_PDF = 'AWAITING_AGREEMENT_PDF',
  AWAITING_ZONE = 'AWAITING_ZONE',
  AWAITING_FUEL_BASIS = 'AWAITING_FUEL_BASIS',
  AWAITING_BILL_PDF = 'AWAITING_BILL_PDF',
  AWAITING_COUPON = 'AWAITING_COUPON',
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
  /** The phone awaiting its WhatsApp code — linking happens only after the code matches. */
  pendingLinkPhone?: string;
  /** When the account link was verified. Links expire 90 days after this. */
  linkedAt?: string;
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
  /**
   * Bills sent before the contract was ready (no agreement yet, or the zone/fuel
   * questions unanswered). A list, not one slot: a user forwarding a whole set of
   * running bills sends them in one burst, and the earlier single slot meant every
   * bill but the last was silently dropped.
   */
  docPendingBills?: Array<{ fileId: string; fileName: string }>;
  /** Extracted agreement fields held back until the user supplies the tender closing date. */
  docPendingAgreement?: any;
  /** Report data waiting on payment — rendered and sent by the Razorpay webhook. */
  docPendingReport?: any;
  /** Razorpay payment link id, so /paid can verify payment without the webhook. */
  docPendingPaymentLinkId?: string;
  /**
   * Every unpaid report, keyed by its own payment link. With several bills in flight
   * for one agreement the single slot above would hand whoever paid the last bill's
   * report, so the webhook matches on the link that was actually paid and falls back
   * to the single slot (older chats, /coupon and /paid, which carry no link).
   */
  docPendingReports?: Array<{ linkId: string; payload: any }>;
  /**
   * Links that pay for several statements at once (/payall), each naming the report
   * links it covers. Paying one delivers every statement it covers.
   */
  docBundlePayments?: Array<{ linkId: string; coversLinkIds: string[] }>;
  /** Per-day usage counter for rate limiting (resets when the date changes). */
  dailyUsage?: { date: string; pdfs: number };
  /** ISO time a report render/send started — a soft lock against re-render spam. */
  reportDeliveringAt?: string;
  /** The same lock, per payment link, so two bills can be paid for at the same time. */
  reportDelivering?: Record<string, string>;
  /** Railway zone code (e.g. SR) — drives the steel indices and the zone-city fuel index. */
  docZone?: string;
  /** 'four_city_avg' or 'zone_city' — which fuel price basis this contract uses. */
  docFuelPriceType?: string;
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

  // The account LINK expires too: 90 days after verification, the chat must prove the
  // phone again. A linked chat reads that account's contracts and bills, and phones
  // change hands; the flow's 24-hour reset never touched the link. Chats linked before
  // this rule carry no linkedAt — they are stamped on first sight rather than all
  // being thrown out by a deploy.
  if (conversation?.userId) {
    const data = (conversation.conversationData as TelegramConversationData) || {};
    if (!data.linkedAt) {
      conversation = await prisma.telegramConversation.update({
        where: { id: conversation.id },
        data: { conversationData: { ...data, linkedAt: new Date().toISOString() } as any },
        include: { user: true },
      });
    } else if (Date.now() - new Date(data.linkedAt).getTime() > 90 * 24 * 60 * 60 * 1000) {
      conversation = await prisma.telegramConversation.update({
        where: { id: conversation.id },
        data: {
          userId: null,
          currentStep: TelegramStep.IDLE,
          conversationData: { ...data, linkedAt: undefined } as any,
        },
        include: { user: true },
      });
    }
  }

  if (conversation && conversation.lastMessageAt < twentyFourHoursAgo) {
    // The idle reset clears the FLOW, not the facts. Wiping everything erased
    // linkedAt — so the next message's grandfather branch re-stamped the link as
    // fresh and the 90-day expiry could never fire — and destroyed pending paid
    // reports whose Razorpay links were still payable: the user paid days later and
    // /paid found nothing waiting. Those survive the reset; only the step state goes.
    const staleData = (conversation.conversationData as TelegramConversationData) || {};
    const kept: Record<string, unknown> = {};
    for (const key of ['linkedAt', 'docPendingReports', 'docPendingReport', 'docBundlePayments', 'dailyUsage'] as const) {
      if ((staleData as any)[key] !== undefined) kept[key] = (staleData as any)[key];
    }
    conversation = await prisma.telegramConversation.update({
      where: { id: conversation.id },
      data: {
        currentStep: TelegramStep.IDLE,
        conversationData: kept as any,
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
 * Read-modify-write of the conversation data under a serialisable transaction.
 *
 * Use this instead of updateTelegramConversation whenever the change depends on
 * what is already stored — appending to a list, taking an item off one. Several
 * bills for the same agreement arrive as separate webhook calls that run at the
 * same time, and the plain update above reads the whole JSON blob and writes it
 * back, so the later write silently drops the earlier one's entry. Losing a queued
 * bill costs the user a re-upload; losing a pending report costs them a payment.
 */
export async function mutateTelegramConversationData(
  conversationId: string,
  mutate: (data: TelegramConversationData) => TelegramConversationData,
  step?: TelegramStep,
): Promise<TelegramConversationData> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          const current = await tx.telegramConversation.findUnique({ where: { id: conversationId } });
          if (!current) throw new Error('Conversation not found');
          const next = mutate((current.conversationData as TelegramConversationData) || {});
          await tx.telegramConversation.update({
            where: { id: conversationId },
            data: {
              ...(step ? { currentStep: step } : {}),
              conversationData: next as any,
              lastMessageAt: new Date(),
              expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
            },
          });
          return next;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (err: any) {
      // P2034 is Prisma's "write conflict, retry me". Anything else is a real error.
      const retryable = err?.code === 'P2034' || /could not serialize|deadlock/i.test(String(err?.message || ''));
      if (!retryable || attempt >= 3) throw err;
    }
  }
}

/**
 * The account a phone number belongs to, without linking anything.
 *
 * Split out of linkTelegramToUser so the OTP flow can check the number exists before
 * sending a code — and so nothing can link a conversation as a side effect of a lookup.
 */
export async function findUserByPhone(phone: string) {
  let cleaned = phone.replace(/\D/g, '');
  if (!cleaned.startsWith('91') && cleaned.length === 10) cleaned = '91' + cleaned;
  return prisma.user.findFirst({
    where: {
      OR: [
        { phone: cleaned },
        { phone: '+' + cleaned },
        { phone: cleaned.replace(/^91/, '') },
      ],
    },
  });
}

/**
 * Link a Telegram conversation to a user by phone number.
 *
 * Call ONLY after the number has been proven — the caller must have verified the
 * WhatsApp code sent to it. Possession of the number alone is not proof of anything.
 */
export async function linkTelegramToUser(conversationId: string, phone: string) {
  const user = await findUserByPhone(phone);

  if (user) {
    // linkedAt starts the 90-day clock; it is only ever written here, after the
    // WhatsApp code proved the number.
    const current = await prisma.telegramConversation.findUnique({ where: { id: conversationId } });
    const data = (current?.conversationData as TelegramConversationData) || {};
    await prisma.telegramConversation.update({
      where: { id: conversationId },
      data: {
        userId: user.id,
        conversationData: { ...data, linkedAt: new Date().toISOString() } as any,
      },
    });
    return user;
  }
  return null;
}

export async function resetTelegramConversation(conversationId: string) {
  // /cancel abandons the FLOW; the facts survive. Wiping everything let /cancel
  // erase the link stamp, still-payable pending reports, and the daily PDF counter
  // (a guest could reset their rate limit by typing /cancel between uploads).
  const current = await prisma.telegramConversation.findUnique({ where: { id: conversationId } });
  const data = (current?.conversationData as TelegramConversationData) || {};
  const kept: Record<string, unknown> = {};
  for (const key of ['linkedAt', 'docPendingReports', 'docPendingReport', 'docBundlePayments', 'dailyUsage'] as const) {
    if ((data as any)[key] !== undefined) kept[key] = (data as any)[key];
  }
  return await prisma.telegramConversation.update({
    where: { id: conversationId },
    data: {
      currentStep: TelegramStep.IDLE,
      conversationData: kept as any,
      lastMessageAt: new Date(),
    },
    include: { user: true },
  });
}

export function getTelegramConversationData(conversation: any): TelegramConversationData {
  return (conversation.conversationData as TelegramConversationData) || {};
}
