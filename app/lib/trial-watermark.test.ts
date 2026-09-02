import { describe, expect, it } from 'vitest';
import { isTrialBill, isUnsettledChatBill, needsTrialWatermark } from './trial-watermark';

describe('trial watermark rules', () => {
  const trial = { billTransaction: { discountType: 'trial' }, createdVia: 'manual' };
  const paid = { billTransaction: { discountType: null }, createdVia: 'pdf' };
  const chatUnpaid = { billTransaction: null, createdVia: 'telegram' };
  const legacyWebNoRow = { billTransaction: null, createdVia: null };

  it('stamps a trial bill until the owner tops up', () => {
    expect(isTrialBill(trial)).toBe(true);
    expect(needsTrialWatermark(trial, false)).toBe(true);
    expect(needsTrialWatermark(trial, true)).toBe(false);
  });

  it('stamps a chat bill nobody paid for, and never waives it', () => {
    expect(isUnsettledChatBill(chatUnpaid)).toBe(true);
    expect(needsTrialWatermark(chatUnpaid, true)).toBe(true);
    expect(isUnsettledChatBill({ billTransaction: null, createdVia: 'whatsapp' })).toBe(true);
  });

  it('leaves paid bills and older web bills without a row alone', () => {
    expect(needsTrialWatermark(paid, false)).toBe(false);
    expect(isUnsettledChatBill(legacyWebNoRow)).toBe(false);
    expect(needsTrialWatermark(legacyWebNoRow, false)).toBe(false);
    expect(needsTrialWatermark(null, false)).toBe(false);
  });
});
