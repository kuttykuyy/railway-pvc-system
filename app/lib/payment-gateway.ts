import { prisma } from './db';
import { logger } from './logger';

/**
 * Which payment gateway is taking money right now.
 *
 * One at a time, chosen by an admin setting. Not two live at once: a customer support
 * call that begins "which gateway did you pay through?" is a question nobody should have
 * to answer, and reconciling two sets of settlements against one wallet is where the
 * money goes missing.
 *
 * Switching is a setting rather than a deploy, because the reason to switch is usually
 * that the current one has stopped working, and that is the worst moment to need a build.
 */

export type Gateway = 'razorpay' | 'cashfree';

const SETTING_KEY = 'PAYMENT_GATEWAY';

/** Razorpay unless told otherwise — it is what has been taking money until now. */
export const DEFAULT_GATEWAY: Gateway = 'razorpay';

function parseGateway(value: unknown): Gateway | null {
  const name = String(value ?? '').trim().toLowerCase();
  if (name === 'razorpay' || name === 'cashfree') return name;
  return null;
}

/**
 * The gateway a new payment should go through.
 *
 * Falls back to Razorpay on anything unexpected — an unreadable setting, a typo, a value
 * from a future version. Sending someone to a gateway that is not configured would fail
 * their payment; sending them to the one that has always worked will not.
 */
export async function activeGateway(): Promise<Gateway> {
  try {
    const row = await prisma.adminSettings.findUnique({ where: { key: SETTING_KEY } });
    const chosen = parseGateway(row?.value);
    if (!chosen) return DEFAULT_GATEWAY;

    // Configured, not merely chosen. A gateway named in settings but missing its keys
    // would send every customer to a checkout that cannot open.
    if (chosen === 'cashfree') {
      const { isCashfreeConfigured } = await import('./cashfree');
      if (!(await isCashfreeConfigured())) {
        console.error(
          '[payment-gateway] Cashfree is selected but has no credentials — falling back '
          + 'to Razorpay. Set cashfree_app_id and cashfree_secret_key.',
        );
        return DEFAULT_GATEWAY;
      }
    }
    return chosen;
  } catch (error) {
    logger.warn('[payment-gateway] could not read the setting, using the default:', error);
    return DEFAULT_GATEWAY;
  }
}

/** Set the live gateway. Admin-only callers. */
export async function setActiveGateway(gateway: Gateway, byEmail?: string): Promise<void> {
  await prisma.adminSettings.upsert({
    where: { key: SETTING_KEY },
    create: {
      key: SETTING_KEY,
      value: gateway,
      description: 'Which payment gateway takes new top-ups: razorpay or cashfree.',
      updatedByUserEmail: byEmail ?? null,
    },
    update: { value: gateway, updatedByUserEmail: byEmail ?? null },
  });
  console.info('[payment-gateway] active gateway set to', gateway, 'by', byEmail || 'unknown');
}
