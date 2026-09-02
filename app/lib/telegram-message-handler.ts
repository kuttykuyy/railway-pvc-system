/**
 * Telegram Message Handler
 * Processes incoming Telegram messages and manages bill creation conversation flow
 */

import {
  getOrCreateTelegramConversation,
  updateTelegramConversation,
  resetTelegramConversation,
  getTelegramConversationData,
  linkTelegramToUser,
  findUserByPhone,
  TelegramStep,
} from './telegram-conversation';
import { sendTelegramMessage, replyKeyboard, getPublicSiteUrl } from './telegram-api';
import {
  handleTenderDateReply,
  resumeDocumentFlow,
  startPvcFlow,
  remindToUpload,
  handlePaidCheck,
  handlePayAll,
  handleZoneReply,
  handleFuelBasisReply,
  isCoupon,
  handleCoupon,
  startCoupon,
  handleCouponInput,
} from './telegram-document-flow';
import { prisma } from './db';
import { billRequiresExtension } from './extension-compliance';
import { decideChatBillCharge, settleChatBill } from './chat-bill-charge';

/**
 * Main entry point — called from webhook route
 */
export async function handleTelegramMessage(chatId: string, text: string) {
  try {
    const conversation = await getOrCreateTelegramConversation(chatId);
    const msg = text.trim();
    const lower = msg.toLowerCase();

    // Global commands. /start begins the guided PVC flow; /help just shows the menu.
    if (lower === '/start' || lower === '/pvc' || lower === '/newpvc' || lower === 'new pvc' || lower === 'start') {
      return startPvcFlow(conversation.id, chatId);
    }
    if (lower === '/help' || lower === 'help' || lower === 'menu') {
      return sendHelpMessage(chatId);
    }
    // Setup helper: shows this chat's id, which is what TELEGRAM_ADMIN_CHAT_ID needs.
    if (lower === '/whoami' || lower === '/chatid') {
      return sendTelegramMessage(
        chatId,
        `🆔 <b>Your chat ID</b>\n\n<code>${chatId}</code>\n\n<i>Set this as TELEGRAM_ADMIN_CHAT_ID to receive admin alerts when someone uses the bot.</i>`,
      );
    }
    // Works from any step: rescue a paid-but-undelivered report.
    if (lower === '/paid' || lower === 'paid') {
      return handlePaidCheck(conversation, chatId);
    }
    // One link for every statement still waiting, instead of paying bill by bill.
    if (lower === '/payall' || lower === 'payall' || lower === 'pay all') {
      return handlePayAll(conversation, chatId);
    }
    // Coupon: /coupon prompts for the code; typing a valid code directly also works.
    if (lower === '/coupon' || lower === 'coupon') {
      return startCoupon(conversation, chatId);
    }
    if (isCoupon(msg)) {
      return handleCoupon(conversation, chatId, msg);
    }
    if (lower === '/cancel' || lower === 'cancel' || lower === 'stop') {
      await resetTelegramConversation(conversation.id);
      return sendTelegramMessage(chatId, '❌ Operation cancelled. Type /help to see available commands.');
    }

    // Route by step
    switch (conversation.currentStep) {
      case TelegramStep.IDLE:
      case TelegramStep.AWAITING_COMMAND:
        return handleCommand(conversation, lower, chatId);
      case TelegramStep.AWAITING_PHONE:
        return handlePhoneLinking(conversation, msg, chatId);
      case TelegramStep.AWAITING_LINK_OTP:
        return handleLinkOtp(conversation, msg, chatId);
      case TelegramStep.AWAITING_TENDER_DATE:
        return handleTenderDateReply(conversation, msg, chatId);
      case TelegramStep.AWAITING_ZONE:
        return handleZoneReply(conversation, msg, chatId);
      case TelegramStep.AWAITING_FUEL_BASIS:
        return handleFuelBasisReply(conversation, msg, chatId);
      case TelegramStep.AWAITING_COUPON:
        return handleCouponInput(conversation, msg, chatId);
      // A PDF is expected, not text — nudge with the clip button.
      case TelegramStep.AWAITING_AGREEMENT_PDF:
      case TelegramStep.AWAITING_BILL_PDF:
        return remindToUpload(conversation.currentStep as TelegramStep, chatId);
      // Contract creation steps
      case TelegramStep.AWAITING_AGREEMENT_NO:
        return handleAgreementNo(conversation, msg, chatId);
      case TelegramStep.AWAITING_CONTRACTOR_NAME:
        return handleContractorName(conversation, msg, chatId);
      case TelegramStep.AWAITING_WORK_DESCRIPTION:
        return handleWorkDescription(conversation, msg, chatId);
      case TelegramStep.AWAITING_OPENING_DATE:
        return handleOpeningDate(conversation, msg, chatId);
      case TelegramStep.AWAITING_LOA_NO:
        return handleLoaNo(conversation, msg, chatId);
      case TelegramStep.AWAITING_CONTRACTOR_PHONE:
        return handleContractorPhone(conversation, msg, chatId);
      case TelegramStep.CONFIRMING_CONTRACT:
        return handleConfirmContract(conversation, lower, chatId);
      // Bill creation steps
      case TelegramStep.AWAITING_CONTRACT:
        return handleContractSelection(conversation, msg, chatId);
      case TelegramStep.AWAITING_BILL_NO:
        return handleBillNumber(conversation, msg, chatId);
      case TelegramStep.AWAITING_AMOUNT:
        return handleBillAmount(conversation, msg, chatId);
      case TelegramStep.AWAITING_DATE:
        return handleMeasurementDate(conversation, msg, chatId);
      case TelegramStep.AWAITING_CLASSIFICATION:
        return handleClassificationSelection(conversation, msg, chatId);
      case TelegramStep.AWAITING_CEMENT_CONFIRM:
        return handleCementConfirmation(conversation, lower, chatId);
      case TelegramStep.AWAITING_CEMENT_PERCENTAGE:
        return handleCementPercentage(conversation, msg, chatId);
      case TelegramStep.AWAITING_STEEL_CONFIRM:
        return handleSteelConfirmation(conversation, lower, chatId);
      case TelegramStep.AWAITING_STEEL_PERCENTAGE:
        return handleSteelPercentage(conversation, msg, chatId);
      case TelegramStep.AWAITING_STEEL_TYPE:
        return handleSteelTypeSelection(conversation, msg, chatId);
      case TelegramStep.CONFIRMING:
        return handleConfirmation(conversation, lower, chatId);
      default:
        await resetTelegramConversation(conversation.id);
        return sendTelegramMessage(chatId, 'Something went wrong. Type /help to start over.');
    }
  } catch (error: any) {
    console.error('Telegram handler error:', error);
    return sendTelegramMessage(chatId, '❌ An error occurred. Please try again or type /cancel.');
  }
}

// ─── Commands ────────────────────────────────────────

async function sendHelpMessage(chatId: string) {
  const msg =
    `📋 <b>IR-PVC Bot</b>\n\n` +
    `<b>Work out a PVC — /pvc</b>\n` +
    `I'll ask you for two PDFs, one at a time:\n` +
    `1️⃣ the <b>tender agreement PDF</b> (or the <b>LOA</b>, if the agreement isn't signed yet)\n` +
    `2️⃣ the <b>running bill (RA bill) PDF</b> — send as many bills as you like for the same agreement\n` +
    `➡️ You get the <b>PVC amount free</b>, then can pay in this chat to get the <b>PVC statement PDF</b>.\n\n` +
    `<b>After that:</b>\n` +
    `▫️ Another bill for the same work — just send the next bill PDF\n` +
    `▫️ Several bills to pay for — /payall gives you one link for all of them\n` +
    `▫️ A different work — /pvc to start again\n` +
    `▫️ Stop anytime — /cancel\n\n` +
    `<b>Or type the details instead:</b>\n` +
    `▫️ /pvc — start the two-PDF flow\n` +
    `▫️ /createcontract — enter a contract step by step\n` +
    `▫️ /createbill — enter a bill step by step\n` +
    `▫️ /status — your recent bills\n` +
    `▫️ /help — this menu\n\n` +
    `<i>The PVC from PDFs is an automatic estimate — check it on irpvc.in before filing.</i>`;
  return sendTelegramMessage(chatId, msg);
}

async function handleCommand(conversation: any, command: string, chatId: string) {
  if (command === '/createcontract' || command === 'create contract' || command === 'new contract' || command === 'contract') {
    // Check if user is linked
    if (!conversation.userId) {
      await updateTelegramConversation(conversation.id, TelegramStep.AWAITING_PHONE);
      return sendTelegramMessage(
        chatId,
        '🔗 <b>Link Your Account</b>\n\n' +
          'Your Telegram is not yet linked to an IR-PVC account.\n\n' +
          'Please enter the <b>phone number</b> registered on IR-PVC (e.g., 9876543210):'
      );
    }
    return startContractCreation(conversation, chatId);
  }

  if (command === '/createbill' || command === 'create bill' || command === 'new bill' || command === 'bill') {
    // Check if user is linked
    if (!conversation.userId) {
      await updateTelegramConversation(conversation.id, TelegramStep.AWAITING_PHONE);
      return sendTelegramMessage(
        chatId,
        '🔗 <b>Link Your Account</b>\n\n' +
          'Your Telegram is not yet linked to an IR-PVC account.\n\n' +
          'Please enter the <b>phone number</b> registered on IR-PVC (e.g., 9876543210):'
      );
    }
    return startBillCreation(conversation, chatId);
  }

  if (command === '/status' || command === 'status' || command === 'my bills') {
    if (!conversation.userId) {
      await updateTelegramConversation(conversation.id, TelegramStep.AWAITING_PHONE);
      return sendTelegramMessage(
        chatId,
        '🔗 <b>Link Your Account</b>\n\nPlease enter the <b>phone number</b> registered on IR-PVC:'
      );
    }
    return sendBillStatus(conversation, chatId);
  }

  return sendHelpMessage(chatId);
}

// ─── Phone Linking ───────────────────────────────────

async function handlePhoneLinking(conversation: any, msg: string, chatId: string) {
  const phone = msg.replace(/[\s\-\+]/g, '');
  if (!/^\d{10,12}$/.test(phone)) {
    return sendTelegramMessage(chatId, '❌ Invalid phone number. Please enter a 10-digit number (e.g., 9876543210).');
  }

  const user = await findUserByPhone(phone);
  if (!user) {
    // First-time user: spell out every step, otherwise "sign up first" is a dead end
    // (they also have to save this number on their profile and add credits).
    const site = getPublicSiteUrl();
    const waiting = getTelegramConversationData(conversation).docBillFileId;
    return sendTelegramMessage(
      chatId,
      `❌ I couldn't find an IR-PVC account with the number <b>${phone}</b>.\n\n` +
        `<b>To get the PDF statement:</b>\n` +
        `1️⃣ Create an account — ${site}/auth/signup\n` +
        `2️⃣ Save <b>this same phone number</b> on your profile\n` +
        `3️⃣ Add credits — ${site}/pricing\n\n` +
        `Then send me that phone number again and I'll send the report` +
        (waiting ? ` — I've kept your bill, so no need to upload it again.` : `.`) +
        `\n\n<i>The PVC amount above is free and needs no account.</i>`,
    );
  }

  // The number exists — now prove it belongs to whoever is typing. A code goes to the
  // number's own WhatsApp; without this, anyone knowing a customer's phone number could
  // bind their chat to that account and read its contracts and bills.
  const { randomInt } = await import('crypto');
  const { sendOtpWhatsApp } = await import('./whatsapp-mydreams');
  const otp = randomInt(100000, 999999).toString();
  await prisma.phoneOtp.create({
    data: { phone, otp, expiresAt: new Date(Date.now() + 10 * 60 * 1000) },
  });
  const sent = await sendOtpWhatsApp(phone, otp);
  if (!sent.success) {
    // Fail closed: no code delivered means no link, never a link without proof.
    return sendTelegramMessage(
      chatId,
      '❌ I could not send a verification code to that number\'s WhatsApp. Check the number and try again in a few minutes.',
    );
  }
  await updateTelegramConversation(conversation.id, TelegramStep.AWAITING_LINK_OTP, { pendingLinkPhone: phone });
  return sendTelegramMessage(
    chatId,
    `🔐 A 6-digit code has been sent to the WhatsApp of <b>${phone}</b>.\n\nEnter it here to link your account.`,
  );
}

/** The WhatsApp code, checked; only a match links the account. */
async function handleLinkOtp(conversation: any, msg: string, chatId: string) {
  const code = msg.trim();
  if (!/^\d{6}$/.test(code)) {
    return sendTelegramMessage(chatId, '❌ Please enter the 6-digit code sent to your WhatsApp, or type "cancel".');
  }
  const data = getTelegramConversationData(conversation);
  const phone = data.pendingLinkPhone;
  if (!phone) {
    await resetTelegramConversation(conversation.id);
    return sendTelegramMessage(chatId, '❌ The linking session expired. Type /link to start again.');
  }

  const record = await prisma.phoneOtp.findFirst({
    where: { phone, verified: false, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  });
  // Attempts are counted against the record so the code cannot be brute-forced from
  // chat: five wrong answers kill it, and a fresh /link mints a fresh code.
  if (!record || record.attempts >= 5) {
    return sendTelegramMessage(chatId, '❌ The code has expired. Type /link to get a new one.');
  }
  if (record.otp !== code) {
    await prisma.phoneOtp.update({ where: { id: record.id }, data: { attempts: { increment: 1 } } });
    return sendTelegramMessage(chatId, '❌ That code is not right. Check your WhatsApp and try again.');
  }
  await prisma.phoneOtp.update({ where: { id: record.id }, data: { verified: true } });

  const user = await linkTelegramToUser(conversation.id, phone);
  if (!user) {
    await resetTelegramConversation(conversation.id);
    return sendTelegramMessage(chatId, '❌ Something went wrong linking the account. Type /link to try again.');
  }

  // Refresh conversation with linked user
  const refreshed = await getOrCreateTelegramConversation(chatId);
  const linkedData = getTelegramConversationData(refreshed);

  // If they were linking in order to get a PVC report they already uploaded,
  // carry straight on instead of making them send the bill again.
  if (linkedData.docContractId && linkedData.docBillFileId) {
    await sendTelegramMessage(chatId, `✅ Account linked — welcome, <b>${user.name || user.email}</b>. Preparing your report…`);
    return resumeDocumentFlow(refreshed.id, chatId);
  }

  await sendTelegramMessage(chatId, `✅ Account linked! Welcome, <b>${user.name || user.email}</b>.\n\nType /createcontract to create a new contract or /createbill to create a new bill.`);
}

// ─── Contract Creation Flow ──────────────────────────

async function startContractCreation(conversation: any, chatId: string) {
  await updateTelegramConversation(conversation.id, TelegramStep.AWAITING_AGREEMENT_NO);
  return sendTelegramMessage(
    chatId,
    `📋 <b>Create New Contract</b>\n\n` +
      `Let's create a new railway contract.\n\n` +
      `Step 1 of 6: Enter the <b>Agreement Number</b> (e.g., AG-001, LOA-2025-123):`
  );
}

async function handleAgreementNo(conversation: any, msg: string, chatId: string) {
  const agreementNo = msg.trim().toUpperCase();
  if (agreementNo.length < 2 || agreementNo.length > 50) {
    return sendTelegramMessage(chatId, '❌ Invalid Agreement Number. Please enter a value between 2 and 50 characters.');
  }

  // Check if agreement number already exists
  const existing = await prisma.contract.findUnique({ where: { agreementNo } });
  if (existing) {
    return sendTelegramMessage(chatId, `❌ A contract with Agreement Number "<b>${agreementNo}</b>" already exists.\n\nPlease use a different Agreement Number.`);
  }

  await updateTelegramConversation(conversation.id, TelegramStep.AWAITING_CONTRACTOR_NAME, { agreementNo });
  return sendTelegramMessage(
    chatId,
    `✅ Agreement Number: <b>${agreementNo}</b>\n\n` +
      `Step 2 of 6: Enter the <b>Contractor Name</b> (e.g., ABC Construction Ltd):`
  );
}

async function handleContractorName(conversation: any, msg: string, chatId: string) {
  const contractorName = msg.trim();
  if (contractorName.length < 2 || contractorName.length > 100) {
    return sendTelegramMessage(chatId, '❌ Invalid name. Please enter between 2 and 100 characters.');
  }

  await updateTelegramConversation(conversation.id, TelegramStep.AWAITING_WORK_DESCRIPTION, { contractorName });
  return sendTelegramMessage(
    chatId,
    `✅ Contractor: <b>${contractorName}</b>\n\n` +
      `Step 3 of 6: Enter the <b>Work Description</b> (e.g., Railway bridge construction):`
  );
}

async function handleWorkDescription(conversation: any, msg: string, chatId: string) {
  const workDescription = msg.trim();
  if (workDescription.length < 5 || workDescription.length > 500) {
    return sendTelegramMessage(chatId, '❌ Invalid description. Please enter between 5 and 500 characters.');
  }

  await updateTelegramConversation(conversation.id, TelegramStep.AWAITING_OPENING_DATE, { workDescription });
  return sendTelegramMessage(
    chatId,
    `✅ Work: <b>${workDescription.substring(0, 50)}...</b>\n\n` +
      `Step 4 of 6: Enter <b>Date of Opening</b> in DD/MM/YYYY format (from LOA):\n` +
      `(e.g., 15/03/2025)`
  );
}

async function handleOpeningDate(conversation: any, msg: string, chatId: string) {
  const match = msg.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) {
    return sendTelegramMessage(chatId, '❌ Invalid date. Use DD/MM/YYYY format (e.g., 15/03/2025).');
  }

  const [, day, month, year] = match;
  const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  if (isNaN(date.getTime())) {
    return sendTelegramMessage(chatId, '❌ Invalid date. Please enter a valid date.');
  }

  const formatted = date.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit', year: 'numeric' });
  await updateTelegramConversation(conversation.id, TelegramStep.AWAITING_LOA_NO, { dateOfOpening: date.toISOString() });
  return sendTelegramMessage(
    chatId,
    `✅ Opening Date: <b>${formatted}</b>\n\n` +
      `Step 5 of 6: Enter the <b>LOA Number</b> (optional - press SKIP to skip):\n` +
      `(e.g., LOA-2025-001)`
  );
}

async function handleLoaNo(conversation: any, msg: string, chatId: string) {
  const input = msg.trim().toUpperCase();

  if (input === 'SKIP' || input === 'S') {
    await updateTelegramConversation(conversation.id, TelegramStep.AWAITING_CONTRACTOR_PHONE, { loaNo: '' });
    return sendTelegramMessage(
      chatId,
      `⏭️ <b>LOA Number skipped</b>\n\n` +
        `Step 6 of 6: Enter <b>Contractor Phone Number</b> (optional - press SKIP to skip):\n` +
        `(e.g., 9876543210)`
    );
  }

  if (input.length < 2 || input.length > 50) {
    return sendTelegramMessage(chatId, '❌ Invalid LOA Number. Enter between 2-50 characters or type SKIP.');
  }

  await updateTelegramConversation(conversation.id, TelegramStep.AWAITING_CONTRACTOR_PHONE, { loaNo: input });
  return sendTelegramMessage(
    chatId,
    `✅ LOA Number: <b>${input}</b>\n\n` +
      `Step 6 of 6: Enter <b>Contractor Phone Number</b> (optional - press SKIP to skip):\n` +
      `(e.g., 9876543210)`
  );
}

async function handleContractorPhone(conversation: any, msg: string, chatId: string) {
  const input = msg.trim();

  let phone = '';
  if (input !== 'SKIP' && input !== 'S' && input !== '') {
    phone = input.replace(/[\s\-\+]/g, '');
    if (!/^\d{10,12}$/.test(phone)) {
      return sendTelegramMessage(chatId, '❌ Invalid phone. Enter 10 digits or type SKIP.');
    }
  }

  await updateTelegramConversation(conversation.id, TelegramStep.CONFIRMING_CONTRACT, { contractorPhone: phone });
  return sendConfirmContractSummary(conversation, chatId);
}

async function sendConfirmContractSummary(conversation: any, chatId: string) {
  const data = getTelegramConversationData(conversation);
  const date = new Date(data.dateOfOpening!);
  const formatted = date.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit', year: 'numeric' });

  let msg =
    `📋 <b>Contract Summary</b>\n\n` +
    `📄 Agreement No: <b>${data.agreementNo}</b>\n` +
    `👤 Contractor: <b>${data.contractorName}</b>\n` +
    `🏗️ Work: <b>${data.workDescription}</b>\n` +
    `📅 Opening Date: <b>${formatted}</b>\n`;
  
  if (data.loaNo) msg += `📋 LOA No: <b>${data.loaNo}</b>\n`;
  if (data.contractorPhone) msg += `📞 Phone: <b>${data.contractorPhone}</b>\n`;

  msg += `\nIs this correct?\n\n▫️ <b>YES</b> to create\n▫️ <b>NO</b> to cancel`;

  return sendTelegramMessage(chatId, msg);
}

async function handleConfirmContract(conversation: any, msg: string, chatId: string) {
  if (msg === 'yes' || msg === 'y' || msg === 'confirm') {
    return createContractFromTelegram(conversation, chatId);
  }
  if (msg === 'no' || msg === 'n') {
    await resetTelegramConversation(conversation.id);
    return sendTelegramMessage(chatId, '❌ Cancelled. Type /createcontract to start over.');
  }
  return sendTelegramMessage(chatId, 'Reply <b>YES</b> to confirm or <b>NO</b> to cancel.');
}

async function createContractFromTelegram(conversation: any, chatId: string) {
  const data = getTelegramConversationData(conversation);
  try {
    const contract = await prisma.contract.create({
      data: {
        // Sent in through the bot, by definition.
        createdVia: 'telegram',
        agreementNo: data.agreementNo!,
        contractorName: data.contractorName!,
        workDescription: data.workDescription!,
        dateOfOpening: new Date(data.dateOfOpening!),
        loaNo: data.loaNo || null,
        contractorPhone: data.contractorPhone || null,
        baseMonth: getBaseMonthFromOpeningDate(new Date(data.dateOfOpening!)),
        userId: conversation.userId,
        pvcApplicable: true,
      },
    });

    await sendTelegramMessage(
      chatId,
      `✅ <b>Contract Created Successfully!</b>\n\n` +
        `📄 Agreement No: <b>${contract.agreementNo}</b>\n` +
        `👤 Contractor: <b>${contract.contractorName}</b>\n` +
        `🏗️ Work: <b>${contract.workDescription}</b>\n\n` +
        `View contract: ${getPublicSiteUrl()}/contracts/${contract.id}\n\n` +
        `Now you can create bills for this contract! Type /createbill to get started.`
    );

    await resetTelegramConversation(conversation.id);
  } catch (error: any) {
    console.error('Error creating contract from Telegram:', error);
    
    // Check for specific error types
    if (error.code === 'P2002') {
      // Unique constraint violation
      return sendTelegramMessage(chatId, `❌ A contract with Agreement Number "<b>${data.agreementNo}</b>" already exists.\n\nPlease try again with a different number.`);
    }
    
    await sendTelegramMessage(chatId, `❌ Error: ${error.message || 'Failed to create contract'}\n\nPlease try again or contact support.`);
    await resetTelegramConversation(conversation.id);
  }
}

// Helper function to calculate base month from opening date
function getBaseMonthFromOpeningDate(openingDate: Date): Date {
  const date = new Date(openingDate);
  date.setMonth(date.getMonth() - 1);
  date.setDate(1);
  date.setHours(0, 0, 0, 0);
  return date;
}

// ─── Bill Creation Flow ──────────────────────────────

async function startBillCreation(conversation: any, chatId: string) {
  const contracts = await prisma.contract.findMany({
    where: { userId: conversation.userId },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });

  if (contracts.length === 0) {
    await resetTelegramConversation(conversation.id);
    return sendTelegramMessage(
      chatId,
      `❌ No contracts found. Please create a contract first at ${getPublicSiteUrl()}`
    );
  }

  let msg = '📋 <b>Select a Contract</b>\n\nReply with the number:\n\n';
  contracts.forEach((c, i) => {
    const desc = c.workDescription.length > 50 ? c.workDescription.substring(0, 50) + '...' : c.workDescription;
    msg += `<b>${i + 1}.</b> ${c.agreementNo}\n    ${desc}\n\n`;
  });
  msg += 'Type /cancel to cancel.';

  await updateTelegramConversation(conversation.id, TelegramStep.AWAITING_CONTRACT, {
    contractIds: contracts.map(c => c.id),
  });
  return sendTelegramMessage(chatId, msg);
}

async function handleContractSelection(conversation: any, msg: string, chatId: string) {
  const data = getTelegramConversationData(conversation);
  const ids = data.contractIds || [];
  const sel = parseInt(msg);

  if (isNaN(sel) || sel < 1 || sel > ids.length) {
    return sendTelegramMessage(chatId, `❌ Invalid. Reply with a number between 1 and ${ids.length}.`);
  }

  const contract = await prisma.contract.findUnique({ where: { id: ids[sel - 1] } });
  if (!contract) {
    await resetTelegramConversation(conversation.id);
    return sendTelegramMessage(chatId, '❌ Contract not found. Please try again.');
  }

  await updateTelegramConversation(conversation.id, TelegramStep.AWAITING_BILL_NO, { contractId: contract.id });
  return sendTelegramMessage(
    chatId,
    `✅ Contract: <b>${contract.agreementNo}</b>\n\nPlease enter the <b>Bill Number</b> (e.g., B1, B2):`
  );
}

async function handleBillNumber(conversation: any, msg: string, chatId: string) {
  const billNo = msg.trim();
  if (billNo.length < 1 || billNo.length > 50) {
    return sendTelegramMessage(chatId, '❌ Invalid bill number. Please enter a valid one (e.g., B1, Bill-001).');
  }
  await updateTelegramConversation(conversation.id, TelegramStep.AWAITING_AMOUNT, { billNo });
  return sendTelegramMessage(chatId, `✅ Bill No: <b>${billNo}</b>\n\nEnter the <b>Bill Amount</b> in ₹ (numbers only, e.g., 50000):`);
}

async function handleBillAmount(conversation: any, msg: string, chatId: string) {
  const amount = parseFloat(msg.replace(/[^\d.]/g, ''));
  if (isNaN(amount) || amount <= 0) {
    return sendTelegramMessage(chatId, '❌ Invalid amount. Enter a valid number (e.g., 50000).');
  }
  await updateTelegramConversation(conversation.id, TelegramStep.AWAITING_DATE, { billAmount: amount });
  return sendTelegramMessage(
    chatId,
    `✅ Amount: <b>₹${amount.toLocaleString('en-IN')}</b>\n\nEnter <b>Date of Measurement</b> in DD/MM/YYYY format (e.g., 15/08/2025):`
  );
}

async function handleMeasurementDate(conversation: any, msg: string, chatId: string) {
  const match = msg.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) {
    return sendTelegramMessage(chatId, '❌ Invalid date. Use DD/MM/YYYY format (e.g., 15/08/2025).');
  }
  const [, day, month, year] = match;
  const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  if (isNaN(date.getTime())) {
    return sendTelegramMessage(chatId, '❌ Invalid date. Please enter a valid date.');
  }

  await updateTelegramConversation(conversation.id, TelegramStep.AWAITING_CLASSIFICATION, {
    dateOfMeasurement: date.toISOString(),
  });
  return sendClassificationSelection(conversation, chatId);
}

// ─── Classification ──────────────────────────────────

async function sendClassificationSelection(conversation: any, chatId: string) {
  const classifications = await prisma.classification.findMany({
    where: { isActive: true },
    orderBy: { code: 'asc' },
    take: 20,
  });

  if (classifications.length === 0) {
    await resetTelegramConversation(conversation.id);
    return sendTelegramMessage(chatId, '❌ No work classifications available. Contact support.');
  }

  let msg = '🏗️ <b>Select Work Classification</b>\n\nReply with the number:\n\n';
  classifications.forEach((c, i) => {
    msg += `<b>${i + 1}.</b> ${c.code}\n    ${c.name}\n    Cement: ${c.cement}%, Steel: ${c.steel}%\n\n`;
  });
  msg += 'Type /cancel to cancel.';

  await updateTelegramConversation(conversation.id, TelegramStep.AWAITING_CLASSIFICATION, {
    classificationIds: classifications.map(c => c.id),
  });
  return sendTelegramMessage(chatId, msg);
}

async function handleClassificationSelection(conversation: any, msg: string, chatId: string) {
  const data = getTelegramConversationData(conversation);
  const ids = data.classificationIds || [];
  const sel = parseInt(msg);

  if (isNaN(sel) || sel < 1 || sel > ids.length) {
    return sendTelegramMessage(chatId, `❌ Invalid. Reply with a number between 1 and ${ids.length}.`);
  }

  const classification = await prisma.classification.findUnique({ where: { id: ids[sel - 1] } });
  if (!classification) {
    await resetTelegramConversation(conversation.id);
    return sendTelegramMessage(chatId, '❌ Classification not found.');
  }

  await updateTelegramConversation(conversation.id, TelegramStep.AWAITING_CEMENT_CONFIRM, {
    classificationId: classification.id,
    classificationName: classification.name,
    cementPercentage: classification.cement,
    steelPercentage: classification.steel,
  });

  if (classification.cement > 0) {
    return sendTelegramMessage(
      chatId,
      `✅ Classification: <b>${classification.code} - ${classification.name}</b>\n\n` +
        `🧱 <b>Cement Component</b>\nDefault: <b>${classification.cement}%</b>\n\n` +
        `Reply:\n▫️ <b>YES</b> to use ${classification.cement}%\n▫️ <b>NO</b> to enter custom %\n▫️ <b>SKIP</b> for 0%`
    );
  }
  // No cement → go to steel
  await updateTelegramConversation(conversation.id, TelegramStep.AWAITING_STEEL_CONFIRM, { cementPercentage: 0 });
  return sendSteelConfirm(conversation, classification, chatId);
}

// ─── Cement ──────────────────────────────────────────

async function handleCementConfirmation(conversation: any, msg: string, chatId: string) {
  const data = getTelegramConversationData(conversation);
  const classification = await prisma.classification.findUnique({ where: { id: data.classificationId } });
  if (!classification) { await resetTelegramConversation(conversation.id); return sendTelegramMessage(chatId, '❌ Classification error.'); }

  if (msg === 'yes' || msg === 'y') {
    await updateTelegramConversation(conversation.id, TelegramStep.AWAITING_STEEL_CONFIRM);
    return sendSteelConfirm(conversation, classification, chatId);
  }
  if (msg === 'no' || msg === 'n') {
    await updateTelegramConversation(conversation.id, TelegramStep.AWAITING_CEMENT_PERCENTAGE);
    return sendTelegramMessage(chatId, '📊 Enter custom cement percentage (0-100):');
  }
  if (msg === 'skip' || msg === 's') {
    await updateTelegramConversation(conversation.id, TelegramStep.AWAITING_STEEL_CONFIRM, { cementPercentage: 0 });
    return sendSteelConfirm(conversation, classification, chatId);
  }
  return sendTelegramMessage(chatId, 'Please reply with <b>YES</b>, <b>NO</b>, or <b>SKIP</b>.');
}

async function handleCementPercentage(conversation: any, msg: string, chatId: string) {
  const pct = parseFloat(msg.replace(/[^\d.]/g, ''));
  if (isNaN(pct) || pct < 0 || pct > 100) {
    return sendTelegramMessage(chatId, '❌ Invalid. Enter a number between 0 and 100.');
  }
  const data = getTelegramConversationData(conversation);
  const classification = await prisma.classification.findUnique({ where: { id: data.classificationId } });
  if (!classification) { await resetTelegramConversation(conversation.id); return sendTelegramMessage(chatId, '❌ Error.'); }

  await updateTelegramConversation(conversation.id, TelegramStep.AWAITING_STEEL_CONFIRM, { cementPercentage: pct });
  return sendSteelConfirm(conversation, classification, chatId);
}

// ─── Steel ───────────────────────────────────────────

async function sendSteelConfirm(conversation: any, classification: any, chatId: string) {
  const data = getTelegramConversationData(conversation);
  if (classification.steel > 0) {
    return sendTelegramMessage(
      chatId,
      `✅ Cement: <b>${data.cementPercentage}%</b>\n\n` +
        `🔩 <b>Steel Component</b>\nDefault: <b>${classification.steel}%</b>\n\n` +
        `Reply:\n▫️ <b>YES</b> to use ${classification.steel}%\n▫️ <b>NO</b> to enter custom %\n▫️ <b>SKIP</b> for 0%`
    );
  }
  // No steel → confirmation
  await updateTelegramConversation(conversation.id, TelegramStep.CONFIRMING, { steelPercentage: 0, selectedSteelTypes: [] });
  return sendConfirmation(conversation, chatId);
}

async function handleSteelConfirmation(conversation: any, msg: string, chatId: string) {
  const data = getTelegramConversationData(conversation);
  const classification = await prisma.classification.findUnique({ where: { id: data.classificationId } });
  if (!classification) { await resetTelegramConversation(conversation.id); return; }

  if (msg === 'yes' || msg === 'y') {
    if (classification.steel > 0) {
      await updateTelegramConversation(conversation.id, TelegramStep.AWAITING_STEEL_TYPE);
      return sendSteelTypeSelection(chatId);
    }
    await updateTelegramConversation(conversation.id, TelegramStep.CONFIRMING, { steelPercentage: 0, selectedSteelTypes: [] });
    return sendConfirmation(conversation, chatId);
  }
  if (msg === 'no' || msg === 'n') {
    await updateTelegramConversation(conversation.id, TelegramStep.AWAITING_STEEL_PERCENTAGE);
    return sendTelegramMessage(chatId, '📊 Enter custom steel percentage (0-100):');
  }
  if (msg === 'skip' || msg === 's') {
    await updateTelegramConversation(conversation.id, TelegramStep.CONFIRMING, { steelPercentage: 0, selectedSteelTypes: [] });
    return sendConfirmation(conversation, chatId);
  }
  return sendTelegramMessage(chatId, 'Please reply with <b>YES</b>, <b>NO</b>, or <b>SKIP</b>.');
}

async function handleSteelPercentage(conversation: any, msg: string, chatId: string) {
  const pct = parseFloat(msg.replace(/[^\d.]/g, ''));
  if (isNaN(pct) || pct < 0 || pct > 100) {
    return sendTelegramMessage(chatId, '❌ Invalid. Enter a number between 0 and 100.');
  }
  await updateTelegramConversation(conversation.id, TelegramStep.AWAITING_STEEL_TYPE, { steelPercentage: pct });
  if (pct > 0) return sendSteelTypeSelection(chatId);
  await updateTelegramConversation(conversation.id, TelegramStep.CONFIRMING, { selectedSteelTypes: [] });
  return sendConfirmation(conversation, chatId);
}

async function sendSteelTypeSelection(chatId: string) {
  return sendTelegramMessage(
    chatId,
    '🔩 <b>Select Steel Types</b>\n\n' +
      'Reply with numbers separated by commas:\n\n' +
      '1. TMT Bars\n2. Angle/Channel\n3. Plates\n4. Other Sections\n\n' +
      '<i>Example: 1,3 for TMT Bars and Plates</i>'
  );
}

async function handleSteelTypeSelection(conversation: any, msg: string, chatId: string) {
  const selections = msg.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n) && n >= 1 && n <= 4);
  if (selections.length === 0) {
    return sendTelegramMessage(chatId, '❌ Invalid. Enter numbers 1-4 separated by commas (e.g., 1,3).');
  }
  const map: Record<number, string> = { 1: 'TMT', 2: 'ANGLE_CHANNEL', 3: 'PLATES', 4: 'OTHER_SECTIONS' };
  const types = selections.map(s => map[s]);
  await updateTelegramConversation(conversation.id, TelegramStep.CONFIRMING, { selectedSteelTypes: types });
  return sendConfirmation(conversation, chatId);
}

// ─── Confirmation & Bill Creation ────────────────────

async function sendConfirmation(conversation: any, chatId: string) {
  const data = getTelegramConversationData(conversation);
  const contract = await prisma.contract.findUnique({ where: { id: data.contractId } });
  if (!contract) { await resetTelegramConversation(conversation.id); return sendTelegramMessage(chatId, '❌ Contract error.'); }

  const date = new Date(data.dateOfMeasurement!);
  const formatted = date.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit', year: 'numeric' });

  const steelNames: Record<string, string> = { TMT: 'TMT Bars', ANGLE_CHANNEL: 'Angle/Channel', PLATES: 'Plates', OTHER_SECTIONS: 'Other Sections' };
  const steelList = (data.selectedSteelTypes || []).map((t: string) => steelNames[t]).join(', ');

  let msg =
    `📋 <b>Bill Summary</b>\n\n` +
    `📄 Contract: <b>${contract.agreementNo}</b>\n` +
    `🔢 Bill No: <b>${data.billNo}</b>\n` +
    `💰 Amount: <b>₹${data.billAmount?.toLocaleString('en-IN')}</b>\n` +
    `📅 Date: <b>${formatted}</b>\n` +
    `🏗️ Classification: <b>${data.classificationName}</b>\n` +
    `🧱 Cement: <b>${data.cementPercentage}%</b>\n` +
    `🔩 Steel: <b>${data.steelPercentage}%</b>\n`;
  if (steelList) msg += `    Steel Types: <b>${steelList}</b>\n`;
  msg += `\nIs this correct?\n\n▫️ <b>YES</b> to create\n▫️ <b>NO</b> to cancel`;

  return sendTelegramMessage(chatId, msg);
}

async function handleConfirmation(conversation: any, msg: string, chatId: string) {
  if (msg === 'yes' || msg === 'y' || msg === 'confirm') {
    return createBillFromTelegram(conversation, chatId);
  }
  if (msg === 'no' || msg === 'n') {
    await resetTelegramConversation(conversation.id);
    return sendTelegramMessage(chatId, '❌ Cancelled. Type /createbill to start over.');
  }
  return sendTelegramMessage(chatId, 'Reply <b>YES</b> to confirm or <b>NO</b> to cancel.');
}

async function createBillFromTelegram(conversation: any, chatId: string) {
  const data = getTelegramConversationData(conversation);
  try {
    const contract = await prisma.contract.findUnique({ where: { id: data.contractId } });
    if (!contract) { await resetTelegramConversation(conversation.id); return sendTelegramMessage(chatId, '❌ Contract not found.'); }

    // Same gate as the web and bulk routes: a bill measured after the date the contract
    // covers waits until the time extension is recorded, because the extension decides
    // how PVC applies to that period. This flow used to create the bill regardless.
    const extensionGate = billRequiresExtension(contract, new Date(data.dateOfMeasurement!));
    if (extensionGate.blocked) {
      const fmt = (d: Date) => new Date(d).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' });
      await resetTelegramConversation(conversation.id);
      return sendTelegramMessage(
        chatId,
        `⚠️ This bill is measured <b>after the contract's completion date</b> ` +
          `(covered until <b>${fmt(extensionGate.coveredUntil!)}</b>).\n\n` +
          `Please record the time extension for this contract first, then run /createbill again:\n` +
          `${getPublicSiteUrl()}/contracts/${contract.id}/extensions`,
      );
    }

    // The same decision the web route makes before it builds a bill: free (role, free
    // account, ₹0 fee, trial remaining) or paid from the credit balance — or not at all.
    // This flow used to create the bill for nothing, every time.
    const charge = await decideChatBillCharge(conversation.userId);
    if (charge.canCreate === false) {
      await resetTelegramConversation(conversation.id);
      return sendTelegramMessage(
        chatId,
        `❌ This bill can't be created yet: ${charge.message}\n\n` +
          `Add credits here and then run /createbill again:\n${getPublicSiteUrl()}/billing`,
      );
    }

    const billAmount = data.billAmount!;
    const cementPct = data.cementPercentage || 0;
    const steelPct = data.steelPercentage || 0;
    const cementAmount = (billAmount * cementPct) / 100;
    const steelAmount = (billAmount * steelPct) / 100;
    const steelTypes = data.selectedSteelTypes || [];
    const steelPerType = steelTypes.length > 0 ? steelAmount / steelTypes.length : 0;

    const bill = await prisma.bill.create({
      data: {
        contractId: data.contractId!,
        billNo: data.billNo!,
        billAmount,
        grossBillAmount: billAmount,
        dateOfMeasurement: new Date(data.dateOfMeasurement!),
        quarter: 'Q1',
        isChargeable: !charge.isFree,
        processingFee: charge.requiredPayment,
        createdVia: 'telegram',
        workClassificationId: data.classificationId,
        cementAmount,
        steelAmount,
        steelTypes,
        steelTmtBarsAmount: steelTypes.includes('TMT') ? steelPerType : 0,
        steelAngleChannelAmount: steelTypes.includes('ANGLE_CHANNEL') ? steelPerType : 0,
        steelPlatesAmount: steelTypes.includes('PLATES') ? steelPerType : 0,
        steelOtherSectionsAmount: steelTypes.includes('OTHER_SECTIONS') ? steelPerType : 0,
        selectedSteelComponent: steelTypes.length > 0 ? 'Steel TMT Bars' : null,
      },
    });

    // Take the trial slot or the money, exactly as the web route does. A bill that
    // cannot be settled is deleted rather than kept: a bill with no paid transaction
    // reads as fully paid to every report route.
    const settled = await settleChatBill({ userId: conversation.userId, billId: bill.id, agreementNo: contract.agreementNo, decision: charge });
    if (!settled.ok) {
      await resetTelegramConversation(conversation.id);
      return sendTelegramMessage(
        chatId,
        `❌ The bill was not created: ${settled.message}\n\n` +
          `Add credits here and then run /createbill again:\n${getPublicSiteUrl()}/billing`,
      );
    }

    await sendTelegramMessage(
      chatId,
      `✅ <b>Bill Created Successfully!</b>\n\n` +
        `📄 Bill No: <b>${bill.billNo}</b>\n` +
        `💰 Amount: <b>₹${bill.billAmount.toLocaleString('en-IN')}</b>\n` +
        `💳 ${settled.message}\n` +
        `🧱 Cement: ${cementPct}% (₹${cementAmount.toLocaleString('en-IN')})\n` +
        `🔩 Steel: ${steelPct}% (₹${steelAmount.toLocaleString('en-IN')})\n\n` +
        `View bill: ${getPublicSiteUrl()}/bills/${bill.id}\n\n` +
        `Type /help to see other commands.`
    );

    await resetTelegramConversation(conversation.id);
  } catch (error: any) {
    console.error('Error creating bill from Telegram:', error);
    await sendTelegramMessage(chatId, `❌ Error: ${error.message}\n\nPlease try again or contact support.`);
    await resetTelegramConversation(conversation.id);
  }
}

// ─── Bill Status ─────────────────────────────────────

async function sendBillStatus(conversation: any, chatId: string) {
  if (!conversation.userId) {
    return sendTelegramMessage(chatId, '❌ Account not linked. Type /createbill to link first.');
  }

  const bills = await prisma.bill.findMany({
    where: { contract: { userId: conversation.userId } },
    include: { contract: true },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });

  if (bills.length === 0) {
    return sendTelegramMessage(chatId, '📋 No bills found. Type /createbill to create your first bill.');
  }

  let msg = '📋 <b>Your Recent Bills</b>\n\n';
  bills.forEach((bill, i) => {
    msg += `<b>${i + 1}.</b> ${bill.billNo}\n`;
    msg += `    Contract: ${bill.contract?.agreementNo}\n`;
    msg += `    Amount: ₹${bill.billAmount.toLocaleString('en-IN')}\n`;
    msg += `    Date: ${new Date(bill.dateOfMeasurement).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}\n\n`;
  });
  msg += `View all: ${getPublicSiteUrl()}/bills`;
  return sendTelegramMessage(chatId, msg);
}
