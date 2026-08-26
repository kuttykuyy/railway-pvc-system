import { describe, expect, it, vi } from 'vitest';

// The exactly-once flip and the wallet movement need a database, so those are proven
// end-to-end against the sandbox. What is unit-testable and worth pinning is the
// amount guard — the one thing standing between "PAID" and crediting the wrong sum.
// It runs BEFORE any database call, so a mocked prisma that throws proves the guard
// short-circuits without ever reaching the transaction.
vi.mock('./db', () => ({
  prisma: { $transaction: () => { throw new Error('should not reach the database'); } },
}));
vi.mock('./db-schema', () => ({ schemaQualified: async () => '"s"."payment_transactions"' }));

import { creditPaymentOnce } from './payment-credit';

const payment = {
  id: 'p1', gateway: 'cashfree', userId: 'u1', orderId: 'ord_1',
  status: 'created', creditAmount: 1000, gstAmount: 180, totalAmount: 1180, notes: null,
};

describe('creditPaymentOnce amount guard', () => {
  it('refuses when the gateway says a different amount was paid', async () => {
    const result = await creditPaymentOnce({ payment, paidAmount: 1000 });
    expect(result.credited).toBe(false);
    expect(result.creditsAdded).toBe(0);
  });

  it('refuses a paid amount far above the order — the over-credit direction', async () => {
    const result = await creditPaymentOnce({ payment, paidAmount: 11800 });
    expect(result.credited).toBe(false);
  });

  it('tolerates rounding within a rupee, then proceeds to the database', async () => {
    // Within tolerance → passes the guard → reaches $transaction, which throws by design.
    await expect(creditPaymentOnce({ payment, paidAmount: 1180.5 })).rejects.toThrow(/database/);
  });

  it('does not gate when the gateway did not report an amount', async () => {
    // No paidAmount → guard skipped → reaches the database.
    await expect(creditPaymentOnce({ payment })).rejects.toThrow(/database/);
  });
});
