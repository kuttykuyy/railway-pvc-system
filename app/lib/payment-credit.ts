import { prisma } from './db';
import { schemaQualified } from './db-schema';
import { logger } from './logger';

/**
 * Turning a confirmed payment into wallet credit — once, and only once, whatever the
 * gateway.
 *
 * Cashfree tells the app a payment succeeded twice on purpose: the browser comes back
 * from checkout and the app fetches the order, AND a webhook arrives independently.
 * Both are legitimate, both must be handled, and between them the wallet must be
 * credited exactly one time. Razorpay has the same shape, and its verify route already
 * guards it with a conditional update; this is that guard, made gateway-neutral so the
 * next gateway does not reinvent it and get it subtly wrong.
 *
 * payment_transactions ships through Pending DB Changes, so there is no Prisma model for
 * it and every touch is raw SQL. The wallet (customerAccount) and the ledger
 * (creditTransaction) ARE Prisma models, so the whole credit runs inside one
 * prisma.$transaction — the flip of the payment row and the movement of money commit
 * together or not at all.
 */

export interface PaymentRow {
  id: string;
  gateway: string;
  userId: string;
  orderId: string;
  status: string;
  creditAmount: number;
  gstAmount: number;
  totalAmount: number;
  notes: Record<string, unknown> | null;
}

/** Read one payment by its gateway order id — what a webhook or a return knows. */
export async function findPaymentByOrderId(
  gateway: string,
  orderId: string,
): Promise<PaymentRow | null> {
  const table = await schemaQualified('payment_transactions');
  const rows = await prisma.$queryRawUnsafe<Array<Record<string, any>>>(
    `SELECT id, gateway, "userId", "orderId", status, "creditAmount", "gstAmount", "totalAmount", notes
     FROM ${table} WHERE gateway = $1 AND "orderId" = $2 LIMIT 1`,
    gateway, orderId,
  );
  const row = rows[0];
  if (!row) return null;
  return {
    id: String(row.id),
    gateway: String(row.gateway),
    userId: String(row.userId),
    orderId: String(row.orderId),
    status: String(row.status),
    creditAmount: Number(row.creditAmount),
    gstAmount: Number(row.gstAmount),
    totalAmount: Number(row.totalAmount),
    notes: (row.notes as Record<string, unknown>) ?? null,
  };
}

export interface CreditResult {
  /** True only for the ONE call that actually moved the money. */
  credited: boolean;
  creditsAdded: number;
  newBalance: number;
}

/**
 * Credit the wallet for a payment that the GATEWAY has confirmed paid.
 *
 * The caller must already have verified with the gateway that the money is real — a
 * webhook signature that checked out, or a server-side order fetch that read PAID.
 * Nothing the browser said reaches this far. This function's single job is the
 * exactly-once bookkeeping.
 *
 * The credited amount is always creditAmount — the credits bought — never the gross
 * paid. This is the exact bug that cost real money on Razorpay: crediting the
 * tax-inclusive total handed out Rs 1,180 of credit on a Rs 1,000 top-up.
 */
export async function creditPaymentOnce(args: {
  payment: PaymentRow;
  gatewayPaymentId?: string | null;
  paymentMethod?: string | null;
  /** What the gateway says was actually paid. Checked against the recorded total. */
  paidAmount?: number | null;
}): Promise<CreditResult> {
  const { payment } = args;
  const table = await schemaQualified('payment_transactions');
  const creditsToAdd = payment.creditAmount;

  // The gateway confirmed PAID, but for how much? We set the order amount ourselves, so
  // this cannot differ today — which is exactly why a difference means something is
  // wrong (a bug, an order-id reused, a flow tampered with) and crediting anyway would
  // be the mistake. A rupee of tolerance for rounding; beyond that, refuse and shout.
  if (typeof args.paidAmount === 'number' && Math.abs(args.paidAmount - payment.totalAmount) > 1) {
    logger.error(
      `[payment-credit] REFUSING to credit ${payment.gateway} ${payment.orderId}: paid `
      + `${args.paidAmount} but the order was for ${payment.totalAmount}.`,
    );
    return { credited: false, creditsAdded: 0, newBalance: 0 };
  }

  return prisma.$transaction(async (tx) => {
    // Flip to success only if it is not already — the conditional is what makes a
    // concurrent webhook and return race resolve to one winner. affectedRows tells us
    // which call won.
    const flipped: number = await tx.$executeRawUnsafe(
      `UPDATE ${table}
         SET status = 'success',
             "gatewayPaymentId" = COALESCE($1, "gatewayPaymentId"),
             "paymentMethod" = COALESCE($2, "paymentMethod"),
             "completedAt" = CURRENT_TIMESTAMP,
             "updatedAt" = CURRENT_TIMESTAMP
       WHERE id = $3 AND status <> 'success'`,
      args.gatewayPaymentId ?? null, args.paymentMethod ?? null, payment.id,
    );
    if (flipped === 0) {
      // Someone else already credited this order. Not an error — the other path did the
      // work — and NOT a second credit.
      return { credited: false, creditsAdded: creditsToAdd, newBalance: 0 };
    }

    const account = await tx.customerAccount.findUnique({
      where: { userId: payment.userId },
      select: { creditBalance: true },
    });
    const balanceBefore = account?.creditBalance ?? 0;
    const balanceAfter = balanceBefore + creditsToAdd;

    await tx.customerAccount.upsert({
      where: { userId: payment.userId },
      update: { creditBalance: balanceAfter },
      create: {
        userId: payment.userId,
        creditBalance: creditsToAdd,
        currentMonthBills: 0,
        outstandingAmount: 0,
      },
    });

    await tx.creditTransaction.create({
      data: {
        userId: payment.userId,
        amount: creditsToAdd,
        type: 'add',
        reason: `${payment.gateway} payment - Order ID: ${payment.orderId}`,
        balanceBefore,
        balanceAfter,
      },
    });

    logger.log(`[payment-credit] credited ${creditsToAdd} to ${payment.userId} for ${payment.gateway} ${payment.orderId}`);
    return { credited: true, creditsAdded: creditsToAdd, newBalance: balanceAfter };
  });
}

/** Record a gateway detail on the row without touching the money — e.g. a Zoho number. */
export async function mergePaymentNotes(
  paymentId: string,
  extra: Record<string, unknown>,
): Promise<void> {
  try {
    const table = await schemaQualified('payment_transactions');
    await prisma.$executeRawUnsafe(
      `UPDATE ${table} SET notes = COALESCE(notes, '{}'::jsonb) || $1::jsonb, "updatedAt" = CURRENT_TIMESTAMP WHERE id = $2`,
      JSON.stringify(extra), paymentId,
    );
  } catch (error) {
    logger.warn('[payment-credit] could not merge notes:', error);
  }
}
