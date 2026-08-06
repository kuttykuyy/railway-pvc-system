/**
 * Telegram notifications for the approval chain.
 *
 * A PVC proposal now passes three desks — the contractor, the executive, and accounts —
 * and nobody was told when it moved. The contractor had to keep opening the bill to see
 * whether it had been approved, and an official had no idea one was waiting.
 *
 * Only users who have linked their Telegram (by phone, see telegram-conversation.ts)
 * can be reached; everyone else is silently skipped. Every send is best-effort: a
 * notification must never fail an approval that has already been recorded.
 */

import { prisma } from './db';
import { sendTelegramMessage } from './telegram-api';

export type ApprovalEvent =
  | 'submitted'
  | 'approved'
  | 'rejected'
  | 'revision_requested'
  | 'passed_for_payment'
  | 'returned_by_accounts';

function money(value: number | null | undefined): string {
  const n = Number(value) || 0;
  return `${n < 0 ? '−' : ''}₹${Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function escapeHtml(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Chat ids for the given users, skipping anyone who has not linked Telegram. */
async function chatIdsForUsers(userIds: string[]): Promise<string[]> {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (ids.length === 0) return [];
  const conversations = await prisma.telegramConversation.findMany({
    where: { userId: { in: ids } },
    select: { chatId: true },
  });
  return [...new Set(conversations.map((c) => c.chatId))];
}

/** Department users of a zone who could act on this bill next. */
async function chatIdsForZoneRole(zone: string | null, role: string): Promise<string[]> {
  if (!zone) return [];
  const users = await prisma.user.findMany({
    where: { role, railwayZone: zone },
    select: { id: true },
  });
  return chatIdsForUsers(users.map((u) => u.id));
}

async function send(chatIds: string[], text: string) {
  for (const chatId of chatIds) {
    try {
      await sendTelegramMessage(chatId, text);
    } catch (err) {
      console.error('[Approval] Telegram notification failed for chat', chatId, err);
    }
  }
}

/**
 * Tells whoever the proposal has just moved to, and whoever has been waiting on it.
 *
 * Never throws: the decision is already saved by the time this runs, and losing a
 * message must not turn a recorded approval into an error on the caller's screen.
 */
export async function notifyApprovalEvent(o: {
  billId: string;
  event: ApprovalEvent;
  actorUserId?: string;
  comments?: string | null;
}): Promise<void> {
  try {
    const bill = await prisma.bill.findUnique({
      where: { id: o.billId },
      select: {
        billNo: true,
        zone: true,
        contract: { select: { agreementNo: true, userId: true, contractorName: true } },
        pvcCalculation: { select: { totalPvc: true } },
      },
    });
    if (!bill) return;

    const actor = o.actorUserId
      ? await prisma.user.findUnique({
        where: { id: o.actorUserId },
        select: { name: true, email: true, designation: true },
      })
      : null;
    const actorName = actor?.name || actor?.email || 'the department';
    const agreement = bill.contract?.agreementNo || '';

    const head = `📄 <b>${escapeHtml(bill.billNo || 'Bill')}</b>\n`
      + `🧾 ${escapeHtml(agreement)}\n`
      + `📈 PVC: <b>${money(bill.pvcCalculation?.totalPvc)}</b>`;
    const remark = o.comments ? `\n\n💬 <i>${escapeHtml(o.comments)}</i>` : '';

    const ownerId = bill.contract?.userId ? [bill.contract.userId] : [];

    switch (o.event) {
      case 'submitted': {
        // The executives of the zone are the ones who can act next.
        const officials = await chatIdsForZoneRole(bill.zone, 'railway_official');
        await send(officials,
          `🔔 <b>A PVC proposal is waiting for your approval</b>\n\n${head}\n👤 ${escapeHtml(bill.contract?.contractorName || '')}`
          + `\n\nOpen the approvals list on irpvc.in to approve it or send it back.`);
        break;
      }
      case 'approved': {
        // Two audiences: the contractor, who must not read "approved" as "paid", and
        // the accounts office, which now holds it.
        await send(await chatIdsForUsers(ownerId),
          `✅ <b>Approved by the executive</b>\n\n${head}${remark}`
          + `\n\nIt now goes to the accounts / audit office for vetting before payment.`);
        await send(await chatIdsForZoneRole(bill.zone, 'accounts_official'),
          `🔔 <b>A proposal is waiting to be vetted</b>\n\n${head}\n👤 ${escapeHtml(bill.contract?.contractorName || '')}`
          + `\n✍️ Approved by ${escapeHtml(actorName)}`
          + `\n\nOpen Accounts / Audit on irpvc.in to pass it for payment or return it.`);
        break;
      }
      case 'passed_for_payment':
        await send(await chatIdsForUsers(ownerId),
          `🎉 <b>Passed for payment</b>\n\n${head}${remark}`
          + `\n\nVetted by ${escapeHtml(actorName)} at the accounts / audit office.`);
        break;
      case 'returned_by_accounts': {
        await send(await chatIdsForUsers(ownerId),
          `↩️ <b>Returned by accounts</b>\n\n${head}${remark}`
          + `\n\nIt has gone back to the executive stage and needs the objection answered.`);
        await send(await chatIdsForZoneRole(bill.zone, 'railway_official'),
          `↩️ <b>Accounts have returned a proposal you approved</b>\n\n${head}${remark}`);
        break;
      }
      case 'rejected':
        await send(await chatIdsForUsers(ownerId),
          `❌ <b>Rejected</b>\n\n${head}${remark}\n\nRejected by ${escapeHtml(actorName)}.`);
        break;
      case 'revision_requested':
        await send(await chatIdsForUsers(ownerId),
          `✏️ <b>Revision requested</b>\n\n${head}${remark}`
          + `\n\nPlease correct the bill and submit it again.`);
        break;
    }
  } catch (err) {
    console.error('[Approval] Telegram notification failed:', err);
  }
}
