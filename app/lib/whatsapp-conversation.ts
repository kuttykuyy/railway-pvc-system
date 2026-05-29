
/**
 * WhatsApp Conversation Management
 * Handles two-way communication and conversation state for bill creation via WhatsApp
 */

import { prisma } from './db';

// Conversation steps
export enum ConversationStep {
  IDLE = 'IDLE',
  AWAITING_COMMAND = 'AWAITING_COMMAND',
  CREATING_BILL = 'CREATING_BILL',
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

// Conversation data structure
export interface ConversationData {
  contractId?: string;
  contractIds?: string[]; // List of contract IDs for selection
  billNo?: string;
  billAmount?: number;
  dateOfMeasurement?: string;
  classificationId?: string;
  classificationIds?: string[]; // List of classification IDs for selection
  classificationName?: string;
  cementPercentage?: number;
  steelPercentage?: number;
  selectedSteelTypes?: string[]; // Array of selected steel types
  lastCommand?: string;
  retryCount?: number;
}

/**
 * Get or create a conversation for a phone number
 */
export async function getOrCreateConversation(phoneNumber: string) {
  // Check for existing active conversation (within last 24 hours)
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  
  let conversation = await prisma.whatsAppConversation.findUnique({
    where: { phoneNumber },
    include: { user: true },
  });

  if (conversation && conversation.lastMessageAt < twentyFourHoursAgo) {
    // Reset expired conversation
    conversation = await prisma.whatsAppConversation.update({
      where: { id: conversation.id },
      data: {
        currentStep: ConversationStep.IDLE,
        conversationData: {},
        lastMessageAt: new Date(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
      include: { user: true },
    });
  } else if (!conversation) {
    // Create new conversation
    conversation = await prisma.whatsAppConversation.create({
      data: {
        phoneNumber,
        currentStep: ConversationStep.IDLE,
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
export async function updateConversation(
  conversationId: string,
  step: ConversationStep,
  data: Partial<ConversationData> = {}
) {
  // Get current conversation data
  const current = await prisma.whatsAppConversation.findUnique({
    where: { id: conversationId },
  });

  if (!current) {
    throw new Error('Conversation not found');
  }

  const currentData = (current.conversationData as ConversationData) || {};
  const updatedData = { ...currentData, ...data };

  return await prisma.whatsAppConversation.update({
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
 * Link conversation to a user via phone number
 */
export async function linkConversationToUser(conversationId: string) {
  const conversation = await prisma.whatsAppConversation.findUnique({
    where: { id: conversationId },
  });

  if (!conversation) {
    throw new Error('Conversation not found');
  }

  // Find user by phone number
  const user = await prisma.user.findFirst({
    where: { phone: conversation.phoneNumber },
  });

  if (user) {
    await prisma.whatsAppConversation.update({
      where: { id: conversationId },
      data: { userId: user.id },
    });
    return user;
  }

  return null;
}

/**
 * Reset conversation to idle state
 */
export async function resetConversation(conversationId: string) {
  return await prisma.whatsAppConversation.update({
    where: { id: conversationId },
    data: {
      currentStep: ConversationStep.IDLE,
      conversationData: {},
      lastMessageAt: new Date(),
    },
    include: { user: true },
  });
}

/**
 * Get conversation data as typed object
 */
export function getConversationData(conversation: any): ConversationData {
  return (conversation.conversationData as ConversationData) || {};
}

/**
 * Clean up expired conversations (older than 7 days)
 */
export async function cleanupExpiredConversations() {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  
  const deleted = await prisma.whatsAppConversation.deleteMany({
    where: {
      lastMessageAt: {
        lt: sevenDaysAgo,
      },
    },
  });

  console.log(`Cleaned up ${deleted.count} expired WhatsApp conversations`);
  return deleted.count;
}
