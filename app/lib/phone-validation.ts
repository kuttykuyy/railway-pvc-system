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
