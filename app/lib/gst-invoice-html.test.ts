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

  // Both are mandatory particulars of a tax invoice and were absent from the document.
  it('always states that tax is not payable on reverse charge', () => {
    const html = generateGstInvoiceHtml(baseInvoice, {});
    expect(html).toContain('Reverse Charge:');
    expect(html).toContain('tax is payable by the supplier');
  });

  it("takes the place of supply from the customer's GSTIN", () => {
    const html = generateGstInvoiceHtml(
      { ...baseInvoice, customerGstin: '27AAAAA0000A1Z5', isInterstate: true, igst: 180, cgst: 0, sgst: 0 },
      {},
    );
    expect(html).toContain('Place of Supply:');
    expect(html).toContain('Maharashtra (27)');
  });

  it("falls back to the supplier's own state when the supply stayed in-state", () => {
    // No GSTIN and CGST+SGST charged: the supply did not leave Tamil Nadu.
    const html = generateGstInvoiceHtml(baseInvoice, {});
    expect(html).toContain('Tamil Nadu (33)');
  });

  it('claims no place of supply when it cannot be established', () => {
    // IGST but no GSTIN — the state was known elsewhere and is not recorded here, so
    // printing a guess would be worse than printing nothing.
    const html = generateGstInvoiceHtml(
      { ...baseInvoice, customerGstin: '', isInterstate: true, igst: 180, cgst: 0, sgst: 0 },
      {},
    );
    expect(html).not.toContain('Place of Supply:');
  });

  it('prefers a place of supply recorded on the invoice itself', () => {
    const html = generateGstInvoiceHtml(
      { ...baseInvoice, placeOfSupply: 'Karnataka (29)' },
      {},
    );
    expect(html).toContain('Karnataka (29)');
  });
});
