
/**
 * WhatsApp Message Handler
 * Processes incoming messages and manages conversation flow
 */

import {
  getOrCreateConversation,
  updateConversation,
  resetConversation,
  getConversationData,
  linkConversationToUser,
  ConversationStep,
  ConversationData,
} from './whatsapp-conversation';
import { sendWhatsAppTextMessage } from './whatsapp-response';
import { prisma } from './db';

/**
 * Format phone number for WhatsApp (91XXXXXXXXXX format)
 */
export function formatPhoneNumber(phone: string): string {
  // Remove all non-numeric characters
  let cleaned = phone.replace(/\D/g, '');
  
  // Remove leading + if present
  if (cleaned.startsWith('+')) {
    cleaned = cleaned.substring(1);
  }
  
  // Add 91 prefix if not present
  if (!cleaned.startsWith('91')) {
    // If it's a 10-digit number, add 91 prefix
    if (cleaned.length === 10) {
      cleaned = '91' + cleaned;
    }
  }
  
  return cleaned;
}

/**
 * Main message handler - routes messages based on conversation state
 */
export async function handleIncomingMessage(phoneNumber: string, message: string) {
  try {
    // Format phone number
    const formattedPhone = formatPhoneNumber(phoneNumber);
    
    // Get or create conversation
    const conversation = await getOrCreateConversation(formattedPhone);
    
    // Link to user if not already linked
    if (!conversation.userId) {
      await linkConversationToUser(conversation.id);
    }

    // Normalize message
    const normalizedMessage = message.trim().toLowerCase();

    // Handle global commands first
    if (normalizedMessage === 'help' || normalizedMessage === 'menu') {
      await sendHelpMessage(formattedPhone);
      return;
    }

    if (normalizedMessage === 'cancel' || normalizedMessage === 'stop') {
      await resetConversation(conversation.id);
      await sendWhatsAppTextMessage(
        formattedPhone,
        '❌ Operation cancelled. Type "help" to see available commands.'
      );
      return;
    }

    // Route based on current step
    switch (conversation.currentStep) {
      case ConversationStep.IDLE:
      case ConversationStep.AWAITING_COMMAND:
        await handleCommand(conversation, normalizedMessage);
        break;

      case ConversationStep.AWAITING_CONTRACT:
        await handleContractSelection(conversation, message);
        break;

      case ConversationStep.AWAITING_BILL_NO:
        await handleBillNumber(conversation, message);
        break;

      case ConversationStep.AWAITING_AMOUNT:
        await handleBillAmount(conversation, message);
        break;

      case ConversationStep.AWAITING_DATE:
        await handleMeasurementDate(conversation, message);
        break;

      case ConversationStep.AWAITING_CLASSIFICATION:
        await handleClassificationSelection(conversation, message);
        break;

      case ConversationStep.AWAITING_CEMENT_CONFIRM:
        await handleCementConfirmation(conversation, normalizedMessage);
        break;

      case ConversationStep.AWAITING_CEMENT_PERCENTAGE:
        await handleCementPercentage(conversation, message);
        break;

      case ConversationStep.AWAITING_STEEL_CONFIRM:
        await handleSteelConfirmation(conversation, normalizedMessage);
        break;

      case ConversationStep.AWAITING_STEEL_PERCENTAGE:
        await handleSteelPercentage(conversation, message);
        break;

      case ConversationStep.AWAITING_STEEL_TYPE:
        await handleSteelTypeSelection(conversation, message);
        break;

      case ConversationStep.CONFIRMING:
        await handleConfirmation(conversation, normalizedMessage);
        break;

      default:
        await sendWhatsAppTextMessage(
          formattedPhone,
          'Sorry, something went wrong. Type "help" to start over.'
        );
        await resetConversation(conversation.id);
    }
  } catch (error: any) {
    console.error('Error handling WhatsApp message:', error);
    await sendWhatsAppTextMessage(
      phoneNumber,
      'Sorry, an error occurred. Please try again or contact support.'
    );
  }
}

/**
 * Handle commands in IDLE state
 */
async function handleCommand(conversation: any, command: string) {
  const phone = conversation.phoneNumber;

  if (command === 'create bill' || command === 'new bill' || command === 'bill') {
    // Check if user is linked
    if (!conversation.userId) {
      await sendWhatsAppTextMessage(
        phone,
        '❌ Your phone number is not registered. Please sign up at ' +
          process.env.NEXTAUTH_URL +
          ' first.'
      );
      return;
    }

    // Start bill creation flow
    await updateConversation(conversation.id, ConversationStep.AWAITING_CONTRACT);
    await sendContractSelectionMessage(conversation);
  } else if (command === 'status' || command === 'my bills') {
    await sendBillStatusMessage(conversation);
  } else {
    await sendHelpMessage(phone);
  }
}

/**
 * Send help/menu message
 */
async function sendHelpMessage(phone: string) {
  const message = `📋 *IRPVC Bill Management*\n\n` +
    `Available commands:\n\n` +
    `▫️ *CREATE BILL* - Start creating a new bill\n` +
    `▫️ *STATUS* - Check your recent bills\n` +
    `▫️ *HELP* - Show this menu\n` +
    `▫️ *CANCEL* - Cancel current operation\n\n` +
    `Simply type the command to get started!`;

  await sendWhatsAppTextMessage(phone, message);
}

/**
 * Send contract selection message
 */
async function sendContractSelectionMessage(conversation: any) {
  const phone = conversation.phoneNumber;

  // Get user's contracts
  const contracts = await prisma.contract.findMany({
    where: { userId: conversation.userId },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });

  if (contracts.length === 0) {
    await sendWhatsAppTextMessage(
      phone,
      '❌ You don\'t have any contracts yet. Please create a contract first at ' +
        process.env.NEXTAUTH_URL
    );
    await resetConversation(conversation.id);
    return;
  }

  let message = '📋 *Select a Contract*\n\n';
  message += 'Reply with the contract number (1, 2, 3, etc.):\n\n';

  contracts.forEach((contract, index) => {
    message += `${index + 1}. ${contract.agreementNo}\n`;
    message += `   ${contract.workDescription.substring(0, 50)}${contract.workDescription.length > 50 ? '...' : ''}\n\n`;
  });

  message += '\nType *CANCEL* to cancel.';

  await sendWhatsAppTextMessage(phone, message);

  // Store contracts in conversation data
  const contractIds = contracts.map((c) => c.id);
  await updateConversation(conversation.id, ConversationStep.AWAITING_CONTRACT, {
    contractIds: contractIds,
  });
}

/**
 * Handle contract selection
 */
async function handleContractSelection(conversation: any, message: string) {
  const phone = conversation.phoneNumber;
  const data = getConversationData(conversation);
  const contractIds = data.contractIds || [];

  // Parse selection (1, 2, 3, etc.)
  const selection = parseInt(message.trim());

  if (isNaN(selection) || selection < 1 || selection > contractIds.length) {
    await sendWhatsAppTextMessage(
      phone,
      `❌ Invalid selection. Please reply with a number between 1 and ${contractIds.length}.`
    );
    return;
  }

  const contractId = contractIds[selection - 1];
  
  // Get contract details
  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
  });

  if (!contract) {
    await sendWhatsAppTextMessage(phone, '❌ Contract not found. Please try again.');
    await resetConversation(conversation.id);
    return;
  }

  // Update conversation with selected contract
  await updateConversation(conversation.id, ConversationStep.AWAITING_BILL_NO, {
    contractId,
  });

  await sendWhatsAppTextMessage(
    phone,
    `✅ Contract selected: *${contract.agreementNo}*\n\n` +
      `Now, please enter the *Bill Number* (e.g., B1, B2, etc.):`
  );
}

/**
 * Handle bill number input
 */
async function handleBillNumber(conversation: any, message: string) {
  const phone = conversation.phoneNumber;
  const billNo = message.trim();

  // Basic validation
  if (billNo.length < 1 || billNo.length > 50) {
    await sendWhatsAppTextMessage(
      phone,
      '❌ Invalid bill number. Please enter a valid bill number (e.g., B1, Bill-001).'
    );
    return;
  }

  // Update conversation
  await updateConversation(conversation.id, ConversationStep.AWAITING_AMOUNT, {
    billNo,
  });

  await sendWhatsAppTextMessage(
    phone,
    `✅ Bill number: *${billNo}*\n\n` +
      `Now, please enter the *Bill Amount* in Rupees (numbers only, e.g., 50000):`
  );
}

/**
 * Handle bill amount input
 */
async function handleBillAmount(conversation: any, message: string) {
  const phone = conversation.phoneNumber;
  
  // Parse amount
  const amount = parseFloat(message.trim().replace(/[^\d.]/g, ''));

  if (isNaN(amount) || amount <= 0) {
    await sendWhatsAppTextMessage(
      phone,
      '❌ Invalid amount. Please enter a valid number (e.g., 50000).'
    );
    return;
  }

  // Update conversation
  await updateConversation(conversation.id, ConversationStep.AWAITING_DATE, {
    billAmount: amount,
  });

  await sendWhatsAppTextMessage(
    phone,
    `✅ Bill amount: *₹${amount.toLocaleString('en-IN')}*\n\n` +
      `Now, please enter the *Date of Measurement* in DD/MM/YYYY format (e.g., 15/08/2025):`
  );
}

/**
 * Handle measurement date input
 */
async function handleMeasurementDate(conversation: any, message: string) {
  const phone = conversation.phoneNumber;
  const dateStr = message.trim();

  // Parse date (DD/MM/YYYY format)
  const dateRegex = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
  const match = dateStr.match(dateRegex);

  if (!match) {
    await sendWhatsAppTextMessage(
      phone,
      '❌ Invalid date format. Please use DD/MM/YYYY format (e.g., 15/08/2025).'
    );
    return;
  }

  const [, day, month, year] = match;
  const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));

  // Validate date
  if (isNaN(date.getTime())) {
    await sendWhatsAppTextMessage(
      phone,
      '❌ Invalid date. Please enter a valid date in DD/MM/YYYY format.'
    );
    return;
  }

  // Update conversation and move to classification selection
  await updateConversation(conversation.id, ConversationStep.AWAITING_CLASSIFICATION, {
    dateOfMeasurement: date.toISOString(),
  });

  // Send classification selection message
  await sendClassificationSelectionMessage(conversation);
}

/**
 * Send classification selection message
 */
async function sendClassificationSelectionMessage(conversation: any) {
  const phone = conversation.phoneNumber;

  // Get all active classifications
  const classifications = await prisma.classification.findMany({
    where: { isActive: true },
    orderBy: { code: 'asc' },
    take: 20,
  });

  if (classifications.length === 0) {
    await sendWhatsAppTextMessage(
      phone,
      '❌ No work classifications available. Please contact support.'
    );
    await resetConversation(conversation.id);
    return;
  }

  let message = '🏗️ *Select Work Classification*\n\n';
  message += 'Reply with the number (1, 2, 3, etc.):\n\n';

  classifications.forEach((classification, index) => {
    message += `${index + 1}. *${classification.code}*\n`;
    message += `   ${classification.name}\n`;
    message += `   Cement: ${classification.cement}%, Steel: ${classification.steel}%\n\n`;
  });

  message += '\nType *CANCEL* to cancel.';

  await sendWhatsAppTextMessage(phone, message);

  // Store classifications in conversation data
  const classificationIds = classifications.map((c) => c.id);
  await updateConversation(conversation.id, ConversationStep.AWAITING_CLASSIFICATION, {
    classificationIds: classificationIds,
  });
}

/**
 * Handle classification selection
 */
async function handleClassificationSelection(conversation: any, message: string) {
  const phone = conversation.phoneNumber;
  const data = getConversationData(conversation);
  const classificationIds = data.classificationIds || [];

  // Parse selection
  const selection = parseInt(message.trim());

  if (isNaN(selection) || selection < 1 || selection > classificationIds.length) {
    await sendWhatsAppTextMessage(
      phone,
      `❌ Invalid selection. Please reply with a number between 1 and ${classificationIds.length}.`
    );
    return;
  }

  const classificationId = classificationIds[selection - 1];

  // Get classification details
  const classification = await prisma.classification.findUnique({
    where: { id: classificationId },
  });

  if (!classification) {
    await sendWhatsAppTextMessage(phone, '❌ Classification not found. Please try again.');
    await resetConversation(conversation.id);
    return;
  }

  // Update conversation with selected classification
  await updateConversation(conversation.id, ConversationStep.AWAITING_CEMENT_CONFIRM, {
    classificationId,
    classificationName: classification.name,
    cementPercentage: classification.cement,
    steelPercentage: classification.steel,
  });

  // Ask about cement component
  if (classification.cement > 0) {
    await sendWhatsAppTextMessage(
      phone,
      `✅ Classification: *${classification.code} - ${classification.name}*\n\n` +
        `🏗️ *Cement Component*\n\n` +
        `Default cement percentage: *${classification.cement}%*\n\n` +
        `Do you want to use this percentage?\n\n` +
        `Reply with:\n` +
        `▫️ *YES* to use ${classification.cement}%\n` +
        `▫️ *NO* to enter a custom percentage\n` +
        `▫️ *SKIP* for 0% (no cement)`
    );
  } else {
    // No cement, move to steel confirmation
    await updateConversation(conversation.id, ConversationStep.AWAITING_STEEL_CONFIRM, {
      cementPercentage: 0,
    });
    await sendSteelConfirmMessage(conversation, classification);
  }
}

/**
 * Handle cement confirmation
 */
async function handleCementConfirmation(conversation: any, message: string) {
  const phone = conversation.phoneNumber;
  const data = getConversationData(conversation);

  if (message === 'yes' || message === 'y') {
    // Use default cement percentage, move to steel
    const classification = await prisma.classification.findUnique({
      where: { id: data.classificationId },
    });

    if (!classification) {
      await sendWhatsAppTextMessage(phone, '❌ Error: Classification not found.');
      await resetConversation(conversation.id);
      return;
    }

    await updateConversation(conversation.id, ConversationStep.AWAITING_STEEL_CONFIRM);
    await sendSteelConfirmMessage(conversation, classification);
  } else if (message === 'no' || message === 'n') {
    // Ask for custom cement percentage
    await updateConversation(conversation.id, ConversationStep.AWAITING_CEMENT_PERCENTAGE);
    await sendWhatsAppTextMessage(
      phone,
      '📊 *Enter Custom Cement Percentage*\n\n' +
        'Please enter a percentage between 0 and 100 (e.g., 25):'
    );
  } else if (message === 'skip' || message === 's') {
    // Set cement to 0 and move to steel
    const classification = await prisma.classification.findUnique({
      where: { id: data.classificationId },
    });

    if (!classification) {
      await sendWhatsAppTextMessage(phone, '❌ Error: Classification not found.');
      await resetConversation(conversation.id);
      return;
    }

    await updateConversation(conversation.id, ConversationStep.AWAITING_STEEL_CONFIRM, {
      cementPercentage: 0,
    });
    await sendSteelConfirmMessage(conversation, classification);
  } else {
    await sendWhatsAppTextMessage(
      phone,
      'Please reply with *YES*, *NO*, or *SKIP*.'
    );
  }
}

/**
 * Handle custom cement percentage
 */
async function handleCementPercentage(conversation: any, message: string) {
  const phone = conversation.phoneNumber;
  const data = getConversationData(conversation);

  // Parse percentage
  const percentage = parseFloat(message.trim().replace(/[^\d.]/g, ''));

  if (isNaN(percentage) || percentage < 0 || percentage > 100) {
    await sendWhatsAppTextMessage(
      phone,
      '❌ Invalid percentage. Please enter a number between 0 and 100.'
    );
    return;
  }

  // Get classification for steel confirmation
  const classification = await prisma.classification.findUnique({
    where: { id: data.classificationId },
  });

  if (!classification) {
    await sendWhatsAppTextMessage(phone, '❌ Error: Classification not found.');
    await resetConversation(conversation.id);
    return;
  }

  // Update conversation with custom cement percentage
  await updateConversation(conversation.id, ConversationStep.AWAITING_STEEL_CONFIRM, {
    cementPercentage: percentage,
  });

  await sendSteelConfirmMessage(conversation, classification);
}

/**
 * Send steel confirmation message
 */
async function sendSteelConfirmMessage(conversation: any, classification: any) {
  const phone = conversation.phoneNumber;
  const data = getConversationData(conversation);

  if (classification.steel > 0) {
    await sendWhatsAppTextMessage(
      phone,
      `✅ Cement: *${data.cementPercentage}%*\n\n` +
        `🔩 *Steel Component*\n\n` +
        `Default steel percentage: *${classification.steel}%*\n\n` +
        `Do you want to use this percentage?\n\n` +
        `Reply with:\n` +
        `▫️ *YES* to use ${classification.steel}%\n` +
        `▫️ *NO* to enter a custom percentage\n` +
        `▫️ *SKIP* for 0% (no steel)`
    );
  } else {
    // No steel, move to confirmation
    await updateConversation(conversation.id, ConversationStep.CONFIRMING, {
      steelPercentage: 0,
      selectedSteelTypes: [],
    });
    await sendConfirmationMessage(conversation);
  }
}

/**
 * Handle steel confirmation
 */
async function handleSteelConfirmation(conversation: any, message: string) {
  const phone = conversation.phoneNumber;
  const data = getConversationData(conversation);

  if (message === 'yes' || message === 'y') {
    // Use default steel percentage
    const classification = await prisma.classification.findUnique({
      where: { id: data.classificationId },
    });

    if (!classification) {
      await sendWhatsAppTextMessage(phone, '❌ Error: Classification not found.');
      await resetConversation(conversation.id);
      return;
    }

    if (classification.steel > 0) {
      // Ask for steel type selection
      await updateConversation(conversation.id, ConversationStep.AWAITING_STEEL_TYPE);
      await sendSteelTypeSelectionMessage(conversation);
    } else {
      // No steel, move to confirmation
      await updateConversation(conversation.id, ConversationStep.CONFIRMING, {
        steelPercentage: 0,
        selectedSteelTypes: [],
      });
      await sendConfirmationMessage(conversation);
    }
  } else if (message === 'no' || message === 'n') {
    // Ask for custom steel percentage
    await updateConversation(conversation.id, ConversationStep.AWAITING_STEEL_PERCENTAGE);
    await sendWhatsAppTextMessage(
      phone,
      '📊 *Enter Custom Steel Percentage*\n\n' +
        'Please enter a percentage between 0 and 100 (e.g., 35):'
    );
  } else if (message === 'skip' || message === 's') {
    // Set steel to 0 and move to confirmation
    await updateConversation(conversation.id, ConversationStep.CONFIRMING, {
      steelPercentage: 0,
      selectedSteelTypes: [],
    });
    await sendConfirmationMessage(conversation);
  } else {
    await sendWhatsAppTextMessage(
      phone,
      'Please reply with *YES*, *NO*, or *SKIP*.'
    );
  }
}

/**
 * Handle custom steel percentage
 */
async function handleSteelPercentage(conversation: any, message: string) {
  const phone = conversation.phoneNumber;

  // Parse percentage
  const percentage = parseFloat(message.trim().replace(/[^\d.]/g, ''));

  if (isNaN(percentage) || percentage < 0 || percentage > 100) {
    await sendWhatsAppTextMessage(
      phone,
      '❌ Invalid percentage. Please enter a number between 0 and 100.'
    );
    return;
  }

  // Update conversation with custom steel percentage
  await updateConversation(conversation.id, ConversationStep.AWAITING_STEEL_TYPE, {
    steelPercentage: percentage,
  });

  if (percentage > 0) {
    await sendSteelTypeSelectionMessage(conversation);
  } else {
    // No steel, move to confirmation
    await updateConversation(conversation.id, ConversationStep.CONFIRMING, {
      selectedSteelTypes: [],
    });
    await sendConfirmationMessage(conversation);
  }
}

/**
 * Send steel type selection message
 */
async function sendSteelTypeSelectionMessage(conversation: any) {
  const phone = conversation.phoneNumber;

  const message =
    '🔩 *Select Steel Types*\n\n' +
    'You can select one or more steel types.\n' +
    'Reply with numbers separated by commas (e.g., 1,3 for TMT and Plates):\n\n' +
    '1. TMT Bars\n' +
    '2. Angle/Channel\n' +
    '3. Plates\n' +
    '4. Other Sections\n\n' +
    '*Example:* Reply "1" for only TMT Bars\n' +
    '*Example:* Reply "1,2" for TMT Bars and Angle/Channel\n\n' +
    'Type *CANCEL* to cancel.';

  await sendWhatsAppTextMessage(phone, message);
}

/**
 * Handle steel type selection
 */
async function handleSteelTypeSelection(conversation: any, message: string) {
  const phone = conversation.phoneNumber;

  // Parse selections (1,2,3,4)
  const selections = message
    .trim()
    .split(',')
    .map((s) => parseInt(s.trim()))
    .filter((n) => !isNaN(n) && n >= 1 && n <= 4);

  if (selections.length === 0) {
    await sendWhatsAppTextMessage(
      phone,
      '❌ Invalid selection. Please enter numbers from 1-4 separated by commas.\n\n' +
        '*Example:* 1,3 for TMT Bars and Plates'
    );
    return;
  }

  // Map selections to steel type codes
  const steelTypeMap: { [key: number]: string } = {
    1: 'TMT',
    2: 'ANGLE_CHANNEL',
    3: 'PLATES',
    4: 'OTHER_SECTIONS',
  };

  const selectedSteelTypes = selections.map((s) => steelTypeMap[s]);

  // Update conversation with steel types
  await updateConversation(conversation.id, ConversationStep.CONFIRMING, {
    selectedSteelTypes,
  });

  // Show confirmation with all details
  await sendConfirmationMessage(conversation);
}

/**
 * Send confirmation message with summary
 */
async function sendConfirmationMessage(conversation: any) {
  const phone = conversation.phoneNumber;
  const data = getConversationData(conversation);

  // Get contract details
  const contract = await prisma.contract.findUnique({
    where: { id: data.contractId },
  });

  if (!contract) {
    await sendWhatsAppTextMessage(phone, '❌ Error: Contract not found.');
    await resetConversation(conversation.id);
    return;
  }

  const date = new Date(data.dateOfMeasurement!);
  const formattedDate = date.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  // Map steel types to readable names
  const steelTypeNames: { [key: string]: string } = {
    TMT: 'TMT Bars',
    ANGLE_CHANNEL: 'Angle/Channel',
    PLATES: 'Plates',
    OTHER_SECTIONS: 'Other Sections',
  };

  const selectedSteelTypeNames = (data.selectedSteelTypes || [])
    .map((type: string) => steelTypeNames[type])
    .join(', ');

  let message =
    `📋 *Bill Summary*\n\n` +
    `📄 *Contract:* ${contract.agreementNo}\n` +
    `🔢 *Bill No:* ${data.billNo}\n` +
    `💰 *Amount:* ₹${data.billAmount?.toLocaleString('en-IN')}\n` +
    `📅 *Date:* ${formattedDate}\n` +
    `🏗️ *Classification:* ${data.classificationName}\n` +
    `🧱 *Cement:* ${data.cementPercentage}%\n` +
    `🔩 *Steel:* ${data.steelPercentage}%\n`;

  if (data.selectedSteelTypes && data.selectedSteelTypes.length > 0) {
    message += `   *Steel Types:* ${selectedSteelTypeNames}\n`;
  }

  message +=
    `\n` +
    `Is this correct?\n\n` +
    `Reply with:\n` +
    `▫️ *YES* to create the bill\n` +
    `▫️ *NO* to cancel`;

  await sendWhatsAppTextMessage(phone, message);
}

/**
 * Handle confirmation (YES/NO)
 */
async function handleConfirmation(conversation: any, message: string) {
  const phone = conversation.phoneNumber;

  if (message === 'yes' || message === 'y' || message === 'confirm') {
    await createBillFromConversation(conversation);
  } else if (message === 'no' || message === 'n') {
    await sendWhatsAppTextMessage(
      phone,
      '❌ Bill creation cancelled. Type "create bill" to start over.'
    );
    await resetConversation(conversation.id);
  } else {
    await sendWhatsAppTextMessage(
      phone,
      'Please reply with *YES* to confirm or *NO* to cancel.'
    );
  }
}

/**
 * Create bill from conversation data
 */
async function createBillFromConversation(conversation: any) {
  const phone = conversation.phoneNumber;
  const data = getConversationData(conversation);

  try {
    // Get contract for base month calculation
    const contract = await prisma.contract.findUnique({
      where: { id: data.contractId },
    });

    if (!contract) {
      await sendWhatsAppTextMessage(phone, '❌ Error: Contract not found.');
      await resetConversation(conversation.id);
      return;
    }

    // Calculate cement and steel amounts based on percentages
    const billAmount = data.billAmount!;
    const cementPercentage = data.cementPercentage || 0;
    const steelPercentage = data.steelPercentage || 0;

    const cementAmount = (billAmount * cementPercentage) / 100;
    const steelAmount = (billAmount * steelPercentage) / 100;

    // For steel types, distribute steel amount equally if multiple types selected
    const selectedSteelTypes = data.selectedSteelTypes || [];
    const steelAmountPerType = selectedSteelTypes.length > 0 
      ? steelAmount / selectedSteelTypes.length 
      : 0;

    // Create bill
    const bill = await prisma.bill.create({
      data: {
        contractId: data.contractId!,
        billNo: data.billNo!,
        billAmount: billAmount,
        grossBillAmount: billAmount,
        dateOfMeasurement: new Date(data.dateOfMeasurement!),
        quarter: 'Q1', // Will be calculated properly in the API or during PVC calculation
        isChargeable: true,
        processingFee: 1000,
        workClassificationId: data.classificationId,
        cementAmount: cementAmount,
        steelAmount: steelAmount,
        steelTypes: selectedSteelTypes,
        // Distribute steel amount across selected types
        steelTmtBarsAmount: selectedSteelTypes.includes('TMT') ? steelAmountPerType : 0,
        steelAngleChannelAmount: selectedSteelTypes.includes('ANGLE_CHANNEL') ? steelAmountPerType : 0,
        steelPlatesAmount: selectedSteelTypes.includes('PLATES') ? steelAmountPerType : 0,
        steelOtherSectionsAmount: selectedSteelTypes.includes('OTHER_SECTIONS') ? steelAmountPerType : 0,
        selectedSteelComponent: selectedSteelTypes.length > 0 ? 'Steel TMT Bars' : null,
      },
    });

    await sendWhatsAppTextMessage(
      phone,
      `✅ *Bill Created Successfully!*\n\n` +
        `📄 *Bill No:* ${bill.billNo}\n` +
        `💰 *Amount:* ₹${bill.billAmount.toLocaleString('en-IN')}\n` +
        `🏗️ *Classification:* ${data.classificationName}\n` +
        `🧱 *Cement:* ${cementPercentage}% (₹${cementAmount.toLocaleString('en-IN')})\n` +
        `🔩 *Steel:* ${steelPercentage}% (₹${steelAmount.toLocaleString('en-IN')})\n\n` +
        `You can view the bill details at:\n${process.env.NEXTAUTH_URL}/bills/${bill.id}\n\n` +
        `Type "help" to see other commands.`
    );

    await resetConversation(conversation.id);
  } catch (error: any) {
    console.error('Error creating bill from WhatsApp:', error);
    await sendWhatsAppTextMessage(
      phone,
      `❌ Error creating bill: ${error.message}\n\nPlease try again or contact support.`
    );
    await resetConversation(conversation.id);
  }
}

/**
 * Send bill status message
 */
async function sendBillStatusMessage(conversation: any) {
  const phone = conversation.phoneNumber;

  if (!conversation.userId) {
    await sendWhatsAppTextMessage(
      phone,
      '❌ Your phone number is not registered. Please sign up first.'
    );
    return;
  }

  // Get recent bills
  const bills = await prisma.bill.findMany({
    where: {
      contract: {
        userId: conversation.userId,
      },
    },
    include: {
      contract: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });

  if (bills.length === 0) {
    await sendWhatsAppTextMessage(
      phone,
      '📋 You don\'t have any bills yet.\n\nType "create bill" to create your first bill.'
    );
    return;
  }

  let message = '📋 *Your Recent Bills*\n\n';

  bills.forEach((bill, index) => {
    message += `${index + 1}. ${bill.billNo}\n`;
    message += `   Contract: ${bill.contract?.agreementNo}\n`;
    message += `   Amount: ₹${bill.billAmount.toLocaleString('en-IN')}\n`;
    message += `   Date: ${new Date(bill.dateOfMeasurement).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}\n\n`;
  });

  message += `\nView all bills at: ${process.env.NEXTAUTH_URL}/bills`;

  await sendWhatsAppTextMessage(phone, message);
}
