/**
 * Pure phone-number validation. Kept in its own module (no prisma / next-auth /
 * jwt imports) so client components can import it without pulling the whole
 * WhatsApp/server dependency chain into the browser bundle.
 */
export function validatePhoneNumber(phone: string): boolean {
  // Should contain 10-12 digits
  const phoneRegex = /^\+?[1-9]\d{9,11}$/;
  return phoneRegex.test(phone.replace(/\D/g, ''));
}

/**
 * One phone number, in the one form it gets stored in.
 *
 * Numbers were stored exactly as typed, so the same mobile lived in the database as
 * "+919876543210", "919876543210", "9876543210" and "098765 43210" all at once. Nothing
 * could tell they were the same number: the duplicate check in send-otp is an exact
 * match and would miss every one of those pairs, and the database could not hold a
 * unique constraint on a column whose values disagree about their own format.
 *
 * The output is E.164 — a "+" and digits only. A bare ten-digit number is assumed
 * Indian and given 91, which is the right assumption for a tool used by Indian Railways
 * divisions and their contractors; a number that already carries a country code keeps
 * it. Anything that cannot be made into a plausible number comes back null, and the
 * caller refuses it rather than storing something no one can match later.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  let digits = String(raw).replace(/\D/g, '');
  if (!digits) return null;

  // A trunk-prefixed local number: 0 98765 43210.
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  // The same, written with the country code after the trunk prefix: 0 91 …
  if (digits.length === 13 && digits.startsWith('091')) digits = digits.slice(1);
  // Ten digits on their own: an Indian mobile, per the note above.
  if (digits.length === 10) digits = `91${digits}`;

  // E.164 allows fifteen digits at most, and a country code plus a subscriber number
  // does not get below eleven in any country this product is used in.
  if (digits.length < 11 || digits.length > 15) return null;
  // A leading zero is not a country code.
  if (digits.startsWith('0')) return null;

  return `+${digits}`;
}

/**
 * The wording used everywhere a number is refused, so a person is told the same thing
 * whichever form they typed it into.
 */
export const PHONE_FORMAT_MESSAGE =
  'Enter a valid mobile number — 10 digits, or with the country code (e.g. +91 98765 43210).';

export const PHONE_TAKEN_MESSAGE =
  'This mobile number is already registered to another account. '
  + 'Each account needs its own number, because it is how WhatsApp finds your bills.';

/**
 * An Indian mobile specifically: +91 and ten digits starting 6, 7, 8 or 9.
 *
 * Used to tell a person their number looks wrong at the moment they type it, rather
 * than after a WhatsApp message silently fails to arrive. normalizePhone stays the
 * looser of the two, because it also has to cope with what is already stored.
 */
export function isIndianMobile(normalized: string | null): boolean {
  return !!normalized && /^\+91[6-9]\d{9}$/.test(normalized);
}
