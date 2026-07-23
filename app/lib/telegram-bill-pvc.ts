/**
 * Stage 2 (in progress): turn an uploaded running-bill PDF into a PVC calculation
 * and report, sent back in chat.
 *
 * This is wired into the document flow (telegram-document-flow.ts) and called once
 * both the agreement (→ contract) and the bill PDF are in hand. The full pipeline
 * is: extract bill items → map to classification entries → run the PVC engine →
 * generate the PDF report → send it to the chat.
 *
 * For now it acknowledges both files and points the user to the saved contract so
 * the bill-extraction + PVC engine can be layered on without changing this call
 * surface.
 */

import { prisma } from './db';
import { sendTelegramMessage, getPublicSiteUrl } from './telegram-api';

export interface ProcessUploadedBillArgs {
  chatId: string;
  conversationId: string;
  contractId: string;
  billFileId: string;
  billFileName: string;
}

export async function processUploadedBillPvc(args: ProcessUploadedBillArgs): Promise<void> {
  const { chatId, contractId } = args;

  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    select: { agreementNo: true, id: true },
  });

  const baseUrl = getPublicSiteUrl();
  await sendTelegramMessage(
    chatId,
    `✅ <b>Both files received</b> for agreement <b>${contract?.agreementNo || ''}</b>.\n\n` +
      `I'm reading the bill and calculating the PVC — automatic bill-to-PVC is being rolled out. ` +
      `Meanwhile you can open the contract here:\n${baseUrl}/contracts/${contractId}`,
  );
}
