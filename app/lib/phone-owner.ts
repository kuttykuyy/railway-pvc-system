import { prisma } from './db';
import { normalizePhone } from './phone-validation';

/**
 * Who owns a mobile number — asked once, in one place, by everything that writes one.
 *
 * A number identifies an account: the WhatsApp bot finds your contracts by it. Nothing
 * enforced that it belonged to only one account. Signup checked the email for duplicates
 * and never looked at the phone, the mobile form checked nothing at all, and the column
 * had no unique constraint — so any number of accounts could hold the same number, and
 * which one the bot then picked was whatever the database happened to return first.
 *
 * Every number is matched in its NORMALISED form, and also against the raw shapes the
 * same number was stored in before normalisation existed. Without that second part the
 * check would pass for "+919876543210" while "9876543210" sat in a row right beside it.
 */

/** The stored strings that could be this same number, for matching against old rows. */
export function phoneMatchCandidates(normalized: string): string[] {
  const digits = normalized.replace(/\D/g, '');
  const last10 = digits.length > 10 ? digits.slice(-10) : digits;
  return Array.from(new Set([
    normalized,
    digits,
    `+${digits}`,
    last10,
    `0${last10}`,
    `+91${last10}`,
    `91${last10}`,
  ]));
}

export interface PhoneOwner {
  id: string;
  email: string;
  phone: string | null;
}

/** Every account currently holding this number, in any stored form. */
export async function accountsHoldingPhone(normalized: string): Promise<PhoneOwner[]> {
  return prisma.user.findMany({
    where: { phone: { in: phoneMatchCandidates(normalized) } },
    select: { id: true, email: true, phone: true },
  });
}

/**
 * Is this number free for the given account to take?
 *
 * `exceptUserId` is the account doing the saving, so re-saving your own number — which
 * is what happens every time somebody opens the profile form and presses save — is not
 * reported as a clash with yourself.
 */
export async function phoneIsTaken(
  rawOrNormalized: string,
  exceptUserId?: string | null,
): Promise<boolean> {
  const normalized = normalizePhone(rawOrNormalized);
  if (!normalized) return false;
  const owners = await accountsHoldingPhone(normalized);
  return owners.some(owner => owner.id !== exceptUserId);
}
