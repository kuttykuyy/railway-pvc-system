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
 * Where the "delivery is broken" flag lives. AdminSettings, so it survives a cold start
 * and every instance sees the same answer.
 */
const BREAKER_KEY = 'phone_otp_delivery_broken_until';

/** How long one delivery failure lifts the requirement for. Long enough to sign up in. */
const BREAKER_MINUTES = 30;

/**
 * Delivery has failed — stop demanding proof nobody can obtain.
 *
 * This exists because it happened. The requirement was tied to WhatsApp being
 * CONFIGURED, and WhatsApp was configured perfectly well; what was missing was the
 * 'otp_verification' template at the provider, so every code came back
 * "(#132001) Template name does not exist" and no new user could get past the sign-up
 * form at all. Configured is not the same as working, and only the second one matters
 * to somebody trying to sign up.
 *
 * It expires by itself, and a single successful send clears it, so the requirement comes
 * back the moment the channel does without anyone remembering to turn it on.
 */
export async function markOtpDeliveryBroken(reason: string): Promise<void> {
  const until = new Date(Date.now() + BREAKER_MINUTES * 60 * 1000).toISOString();
  console.error(
    `[phone-otp] Cannot deliver verification codes (${reason}). Mobile numbers will be `
    + `accepted WITHOUT verification until ${until}. Fix a delivery channel to restore it.`,
  );
  try {
    await prisma.adminSettings.upsert({
      where: { key: BREAKER_KEY },
      create: { key: BREAKER_KEY, value: until, description: 'Set automatically when no channel could deliver a verification code.' },
      update: { value: until },
    });
  } catch (error) {
    // Even the flag failing must not take the caller down — it is already handling a
    // failure of its own.
    console.error('[phone-otp] could not record the delivery failure:', error);
  }
}

export { classifyOtpDeliveryFailure, type OtpFailureKind } from './otp-failure-kind';

/** A code went out. Whatever was wrong is not wrong now. */
export async function markOtpDeliveryWorking(): Promise<void> {
  try {
    await prisma.adminSettings.deleteMany({ where: { key: BREAKER_KEY } });
  } catch {
    // Nothing to do: the flag expires on its own.
  }
}

/**
 * Whether a number must be proved before it can be saved.
 *
 * Two ways it lifts, and both are the same principle: demanding proof that cannot be
 * delivered locks every new user out of the product, which is a far worse failure than
 * an unverified number.
 *
 *   1. No channel is configured at all — neither WhatsApp nor SMS.
 *   2. Every channel failed recently on the PROVIDER's side — configured, but not
 *      working (see classifyOtpDeliveryFailure).
 *
 * Both are admin-side conditions. A number the provider will not deliver to is the
 * user's own condition and never lifts the requirement, so this is not a hole they can
 * walk through.
 */
export async function phoneOtpRequired(): Promise<boolean> {
  // Either channel will do. Requiring WhatsApp specifically would have switched
  // verification off across the whole product on the day its template went missing,
  // even with SMS sitting there working.
  const { isMsg91Configured } = await import('./msg91');
  const [whatsApp, sms] = await Promise.all([
    isMyDreamsWhatsAppConfigured(),
    isMsg91Configured(),
  ]);
  if (!whatsApp && !sms) {
    console.warn(
      '[phone-otp] No channel can deliver a code — neither WhatsApp nor MSG91 is '
      + 'configured — so mobile numbers are being accepted WITHOUT verification.',
    );
    return false;
  }

  try {
    const flag = await prisma.adminSettings.findUnique({ where: { key: BREAKER_KEY } });
    const until = flag?.value ? new Date(flag.value) : null;
    if (until && until.getTime() > Date.now()) {
      console.warn(
        `[phone-otp] Verification codes could not be delivered recently, so numbers are `
        + `being accepted WITHOUT verification until ${until.toISOString()}.`,
      );
      return false;
    }
  } catch (error) {
    // Cannot read the flag: require verification, which is the safe side of this one.
    console.error('[phone-otp] could not read the delivery flag:', error);
  }

  return true;
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
  'Please verify your mobile number first — tap Verify and enter the code we send you.';
