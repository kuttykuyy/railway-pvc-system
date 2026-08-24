import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * What matters here is when a message is NOT sent. A contractor getting a WhatsApp
 * message they should not have had is worse than a missing one, and the conditions
 * (no credentials, no phone number, an unusable phone number, a batch) are exactly
 * where the old inline code and the bulk route disagreed with each other.
 */
const sendBillPDFWithTemplate = vi.fn();
const isMyDreamsWhatsAppConfigured = vi.fn();
const getAdminWhatsAppNumber = vi.fn();

vi.mock('./whatsapp-mydreams', () => ({
  sendBillPDFWithTemplate: (...args: unknown[]) => sendBillPDFWithTemplate(...args),
  isMyDreamsWhatsAppConfigured: () => isMyDreamsWhatsAppConfigured(),
  getAdminWhatsAppNumber: () => getAdminWhatsAppNumber(),
  // The real one accepts Indian mobile numbers; this stand-in is just as strict about
  // the shape, so the "unusable number" case is genuinely exercised.
  validatePhoneNumber: (value: string) => /^(\+?91)?[6-9]\d{9}$/.test(String(value).replace(/[\s-]/g, '')),
}));

import { notifyBillByWhatsApp } from './bill-whatsapp';

const BILL = { billId: 'bill_1', billNo: 'B/1', contractorName: 'Rajesh', reason: 'created' as const };

describe('notifyBillByWhatsApp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isMyDreamsWhatsAppConfigured.mockResolvedValue(true);
    getAdminWhatsAppNumber.mockResolvedValue('9876543210');
    sendBillPDFWithTemplate.mockResolvedValue({ success: true, messageId: 'm1' });
  });

  it('sends to the contractor and copies the admin', async () => {
    const outcome = await notifyBillByWhatsApp({ ...BILL, contractorPhone: '9876500001' });
    expect(outcome).toMatchObject({ contractor: 'sent', admin: 'sent' });
    expect(sendBillPDFWithTemplate).toHaveBeenCalledTimes(2);
    // Every send goes through the five-parameter path — the contractor's message used
    // to go through a one-parameter call and arrive with four blanks in it.
    expect(sendBillPDFWithTemplate).toHaveBeenCalledWith('bill_1', '9876500001', 'Rajesh');
  });

  it('sends nothing at all when WhatsApp is not configured', async () => {
    isMyDreamsWhatsAppConfigured.mockResolvedValue(false);
    const outcome = await notifyBillByWhatsApp({ ...BILL, contractorPhone: '9876500001' });
    expect(outcome.contractor).toBe('skipped');
    expect(sendBillPDFWithTemplate).not.toHaveBeenCalled();
  });

  it('skips the contractor when the contract has no phone number, and still tells the admin', async () => {
    const outcome = await notifyBillByWhatsApp({ ...BILL, contractorPhone: null });
    expect(outcome.contractor).toBe('skipped');
    expect(outcome.admin).toBe('sent');
    expect(outcome.detail).toMatch(/no contractor phone/i);
    expect(sendBillPDFWithTemplate).toHaveBeenCalledTimes(1);
  });

  it('skips a phone number that is not usable', async () => {
    const outcome = await notifyBillByWhatsApp({ ...BILL, contractorPhone: '12345' });
    expect(outcome.contractor).toBe('skipped');
    expect(outcome.detail).toMatch(/not usable/i);
  });

  it('leaves the admin alone for a batch', async () => {
    const outcome = await notifyBillByWhatsApp({ ...BILL, contractorPhone: '9876500001', notifyAdmin: false });
    expect(outcome.contractor).toBe('sent');
    expect(outcome.admin).toBe('skipped');
    expect(sendBillPDFWithTemplate).toHaveBeenCalledTimes(1);
  });

  it('reports a failed send instead of throwing — a bill must save either way', async () => {
    sendBillPDFWithTemplate.mockResolvedValue({ success: false, error: 'provider said no' });
    const outcome = await notifyBillByWhatsApp({ ...BILL, contractorPhone: '9876500001' });
    expect(outcome.contractor).toBe('failed');
    expect(outcome.detail).toBe('provider said no');
  });

  it('survives the provider throwing', async () => {
    sendBillPDFWithTemplate.mockRejectedValue(new Error('socket hang up'));
    await expect(notifyBillByWhatsApp({ ...BILL, contractorPhone: '9876500001' })).resolves.toMatchObject({
      contractor: 'failed',
    });
  });
});
