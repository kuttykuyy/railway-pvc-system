import { describe, it, expect } from 'vitest';
import { generateGstInvoiceHtml } from './gst-invoice-html';

const baseInvoice = {
  invoiceNumber: 'GST-20260101-0001',
  invoiceDate: new Date('2026-01-01T00:00:00Z'),
  customerName: 'Acme Constructions',
  customerEmail: 'billing@example.com',
  customerPhone: '',
  customerAddress: '',
  customerGstin: '',
  description: 'IR-PVC credits',
  hsn: '998314',
  subtotal: 1000,
  cgst: 90,
  sgst: 90,
  igst: 0,
  totalAmount: 1180,
  isInterstate: false,
  razorpayTransactionId: 'order_ABC123456789',
};

describe('generateGstInvoiceHtml (shared module)', () => {
  it('renders the invoice number and customer name', () => {
    const html = generateGstInvoiceHtml(baseInvoice, {});
    expect(html).toContain('GST-20260101-0001');
    expect(html).toContain('Acme Constructions');
    expect(html).toContain('TAX INVOICE');
  });

  it('HTML-escapes user-controlled fields (stored XSS protection)', () => {
    const html = generateGstInvoiceHtml(
      { ...baseInvoice, customerName: '<script>alert(document.cookie)</script>' },
      {},
    );
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>alert');
  });

  it('escapes an onerror image payload in the address field', () => {
    const html = generateGstInvoiceHtml(
      { ...baseInvoice, customerAddress: '<img src=x onerror=alert(1)>' },
      {},
    );
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toContain('<img src=x onerror=alert(1)>');
  });
});
