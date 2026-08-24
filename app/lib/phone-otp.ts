import { prisma } from './db';
import { isMyDreamsWhatsAppConfigured } from './whatsapp-mydreams';
import { normalizePhone } from './phone-validation';
import { phoneMatchCandidates } from './phone-owner';
import { logger } from './logger';

/**
 * Proving a mobile number belongs to the person giving it.
 *
 * The code to do this has existed the whole time — send-otp, verify-otp, the phone_otps
 * table, WhatsApp delivery, cooldowns and attempt limits — and was called from nowhere.
 * app/api/signup/route.ts still carries the line that removed it:
 *
 *     // Verify that phone OTP was completed - REMOVED
 *
 * So anyone could claim any number, including one belonging to somebody else. Making
 * the number unique fixed a number being claimed TWICE; this is what stops it being
 * claimed WRONGLY.
 */

/** How long a completed verification stays good for. Long enough to finish a form. */
const VERIFICATION_VALID_MINUTES = 30;

/**
 * Whether a number must be proved before it can be saved.
 *
 * Tied to WhatsApp being configured, because WhatsApp is the only way the code is
 * delivered. Demanding proof that cannot be sent would lock every new user out of the
 * product, so when there is no way to deliver a code the requirement lifts and says so
 * in the log. Turning WhatsApp off is an admin action, not something a signing-up user
 * can reach.
 */
export async function phoneOtpRequired(): Promise<boolean> {
  const configured = await isMyDreamsWhatsAppConfigured();
  if (!configured) {
    console.warn(
      '[phone-otp] WhatsApp is not configured, so mobile numbers are being accepted '
      + 'WITHOUT verification. Configure WhatsApp in admin settings to turn this back on.',
    );
  }
  return configured;
}

/**
 * Spend a completed verification for this number, and report whether there was one.
 *
 * The row is DELETED, not just read. A verification that stayed behind could authorise
 * a second signup, and a third — one code proving one number once is the whole point.
 * Every other outstanding code for the same number goes with it, so a half-finished
 * attempt cannot be picked up later.
 */
export async function consumeVerifiedOtp(rawPhone: string): Promise<boolean> {
  const normalized = normalizePhone(rawPhone);
  if (!normalized) return false;

  const since = new Date(Date.now() - VERIFICATION_VALID_MINUTES * 60 * 1000);
  const candidates = phoneMatchCandidates(normalized);

  const verified = await prisma.phoneOtp.findFirst({
    where: { phone: { in: candidates }, verified: true, createdAt: { gte: since } },
    orderBy: { createdAt: 'desc' },
  });
  if (!verified) return false;

  await prisma.phoneOtp.deleteMany({ where: { phone: { in: candidates } } });
  logger.log('[phone-otp] verification spent for', normalized);
  return true;
}

/** The wording used wherever a number arrives without having been proved. */
export const PHONE_UNVERIFIED_MESSAGE =
  'Please verify your mobile number first — tap Verify and enter the code sent to you on WhatsApp.';
