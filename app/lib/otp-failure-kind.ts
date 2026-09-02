/**
 * Is this delivery failure the PROVIDER's — or this one NUMBER's?
 *
 * The breaker exists for the provider case: a missing template, bad credentials, the
 * gateway down. Those fail for every number, and demanding proof nobody can obtain
 * locks every new user out. But the breaker used to trip on ANY failure, including a
 * number the provider simply would not deliver to — a foreign or made-up number. That
 * is something a signing-up user chooses, so anyone could switch verification off for
 * everyone for thirty minutes with one bad number, and farm unverified accounts (one
 * free trial bill each) while it was off.
 *
 * Only a failure that is recognisably the provider's trips the breaker now. A failure
 * that names the recipient, and anything unrecognised, is treated as this number's
 * problem: the user is asked to check the number, and the requirement stands for
 * everyone else. Failing closed here costs one user a retry; failing open cost the
 * whole sign-up gate.
 */
export type OtpFailureKind = 'provider' | 'recipient' | 'unknown';

const RECIPIENT_FAILURE = /invalid\s+(?:phone|mobile|number|recipient)|not a usable mobile|not a valid|recipient|undeliverable|#13102[6-9]|#131030|#131047|#131049|#131053|not (?:a |an )?(?:whatsapp|registered)|opt(?:ed)?[- ]?out|blacklist|blocked|dnd|country code|unsupported (?:number|country)/i;
const PROVIDER_FAILURE = /template|#132001|#132000|#132005|#132007|#132012|not configured|unauthori[sz]ed|forbidden|authentication|auth(?:key| key| token)|api key|access token|token (?:expired|invalid)|ECONNREFUSED|ECONNRESET|ENOTFOUND|ETIMEDOUT|EAI_AGAIN|fetch failed|network|timed? ?out|returned 5\d\d|\b5\d\d\b|internal server error|service unavailable|bad gateway|rate limit|too many requests|insufficient (?:balance|credit)|account (?:suspended|blocked|disabled)|quota/i;

export function classifyOtpDeliveryFailure(error: string | undefined): OtpFailureKind {
  const text = String(error || '');
  if (RECIPIENT_FAILURE.test(text)) return 'recipient';
  if (PROVIDER_FAILURE.test(text)) return 'provider';
  return 'unknown';
}
