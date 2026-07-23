/**
 * Shared "guest" account for Telegram bots that let anyone create a PVC bill
 * without logging in.
 *
 * Every Contract/Bill in the app is owned by a User, so bills created from an
 * unlinked Telegram chat are parked under one well-known guest account. It is
 * marked isFreeAccount so no credit/charge logic applies to it.
 *
 * If a chat IS linked to a real user (by phone), callers use that user instead —
 * this is only the fallback owner.
 */

import { prisma } from './db';

const GUEST_EMAIL = 'telegram-guest@irpvc.in';

let cachedGuestId: string | null = null;

export async function getTelegramGuestUserId(): Promise<string> {
  if (cachedGuestId) return cachedGuestId;

  const existing = await prisma.user.findUnique({
    where: { email: GUEST_EMAIL },
    select: { id: true },
  });
  if (existing) {
    cachedGuestId = existing.id;
    return existing.id;
  }

  const created = await prisma.user.create({
    data: {
      email: GUEST_EMAIL,
      name: 'Telegram Guest',
      role: 'contractor',
      isFreeAccount: true,
    },
    select: { id: true },
  });
  cachedGuestId = created.id;
  return created.id;
}
