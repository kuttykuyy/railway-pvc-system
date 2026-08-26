import { describe, expect, it } from 'vitest';
import crypto from 'crypto';
import { cashfreeBaseUrl, cashfreeOrderIsPaid, verifyCashfreeWebhook } from './cashfree';

describe('cashfreeBaseUrl', () => {
  it('only goes to the live endpoint when production is meant', () => {
    expect(cashfreeBaseUrl('production')).toContain('api.cashfree.com');
    expect(cashfreeBaseUrl('sandbox')).toContain('sandbox.cashfree.com');
  });
});

describe('cashfreeOrderIsPaid', () => {
  it('accepts only PAID', () => {
    expect(cashfreeOrderIsPaid('PAID')).toBe(true);
    expect(cashfreeOrderIsPaid('paid')).toBe(true);
  });

  it('refuses every other state, including the hopeful ones', () => {
    // ACTIVE means the order is open and nobody has paid. Treating it as money is how
    // credits get handed out for a checkout somebody abandoned.
    for (const status of ['ACTIVE', 'EXPIRED', 'TERMINATED', 'PENDING', 'PARTIALLY_PAID', '']) {
      expect(cashfreeOrderIsPaid(status)).toBe(false);
    }
  });
});

describe('verifyCashfreeWebhook', () => {
  const secretKey = 'test_secret';
  const rawBody = '{"data":{"order":{"order_id":"ord_1"}},"type":"PAYMENT_SUCCESS_WEBHOOK"}';
  const timestamp = '1787580000';
  const sign = (ts: string, body: string, key = secretKey) =>
    crypto.createHmac('sha256', key).update(ts + body).digest('base64');

  it('accepts a genuine signature', () => {
    expect(verifyCashfreeWebhook({
      rawBody, timestamp, signature: sign(timestamp, rawBody), secretKey,
    })).toBe(true);
  });

  it('refuses a body that was changed after signing', () => {
    const signature = sign(timestamp, rawBody);
    const tampered = rawBody.replace('ord_1', 'ord_2');
    expect(verifyCashfreeWebhook({ rawBody: tampered, timestamp, signature, secretKey })).toBe(false);
  });

  it('refuses a signature made with a different secret', () => {
    expect(verifyCashfreeWebhook({
      rawBody, timestamp, signature: sign(timestamp, rawBody, 'someone_elses_secret'), secretKey,
    })).toBe(false);
  });

  it('refuses a replayed signature against a different timestamp', () => {
    expect(verifyCashfreeWebhook({
      rawBody, timestamp: '1787599999', signature: sign(timestamp, rawBody), secretKey,
    })).toBe(false);
  });

  it('refuses anything missing rather than treating absence as fine', () => {
    const good = sign(timestamp, rawBody);
    expect(verifyCashfreeWebhook({ rawBody: '', timestamp, signature: good, secretKey })).toBe(false);
    expect(verifyCashfreeWebhook({ rawBody, timestamp: '', signature: good, secretKey })).toBe(false);
    expect(verifyCashfreeWebhook({ rawBody, timestamp, signature: '', secretKey })).toBe(false);
  });

  it('does not throw on a signature of a different length', () => {
    // timingSafeEqual throws on unequal lengths; the length check has to come first or
    // a malformed signature becomes a 500 instead of a refusal.
    expect(verifyCashfreeWebhook({ rawBody, timestamp, signature: 'short', secretKey })).toBe(false);
  });
});
